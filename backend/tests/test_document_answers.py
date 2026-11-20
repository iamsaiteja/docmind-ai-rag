import io
import json

import pytest
from fastapi import HTTPException
from pypdf import PdfWriter

import main
from test_privacy import client, headers


def test_file_overview_uses_first_pages_and_preserves_owner_filter(monkeypatch):
    class Store:
        def get(self, where, include):
            assert where == {'$and': [{'owner': 'mine'}, {'source': 'notice.pdf'}]}
            return {'ids': ['second', 'first'], 'documents': ['Supplement', 'Exam OMR sheet instructions'],
                    'metadatas': [{'source': 'notice.pdf', 'page': 2}, {'source': 'notice.pdf', 'page': 1}]}

    monkeypatch.setattr(main, 'get_collection', lambda: Store())
    for question in ('What is that file?', 'U explain', 'Summarize'):
        context, sources = main.retrieve_context(question, 'mine', document='notice.pdf')
        assert context.startswith('[S1] notice.pdf, page 1\nExam OMR sheet instructions')
        assert sources[0]['source'] == 'notice.pdf'
        assert sources[0]['page'] == 1


def test_long_overview_considers_final_pages(monkeypatch):
    class Store:
        def get(self, where, include):
            assert where == {'owner': 'mine'}
            metadata = [{'source': 'notice.pdf', 'page': page} for page in range(1, 41)]
            return {'ids': list(range(40)), 'metadatas': metadata, 'documents': [f'Page {i}' for i in range(1, 41)]}

    monkeypatch.setattr(main, 'get_collection', lambda: Store())
    _, sources = main.retrieve_context('Summarize the document', 'mine')
    assert len(sources) == 16
    assert sources[0]['page'] == 1 and sources[-1]['page'] == 40


def test_detailed_question_keeps_selected_file_and_retrieves_more_evidence(monkeypatch):
    class Store:
        def get(self, where, include):
            assert where == {'$and': [{'owner': 'mine'}, {'source': 'notice.pdf'}]}
            return {'ids': ['one'], 'documents': ['Deadline is 12 June.'],
                    'metadatas': [{'source': 'notice.pdf', 'page': 5}]}

        def query(self, **kwargs):
            assert kwargs['where'] == {'$and': [{'owner': 'mine'}, {'source': 'notice.pdf'}]}
            assert kwargs['n_results'] == 1
            return {'ids': [['one']]}

    monkeypatch.setattr(main, 'get_collection', lambda: Store())
    monkeypatch.setattr(main, 'get_embeddings', lambda: type('Embed', (), {'embed_query': lambda self, q: [.1]})())
    context, sources = main.retrieve_context('Explain the deadline in this PDF in detail', 'mine', document='notice.pdf')
    assert context == '[S1] notice.pdf, page 5\nDeadline is 12 June.'
    assert sources[0]['source'] == 'notice.pdf'


def test_mixed_language_question_uses_explicit_roman_telugu_system_instruction(client, monkeypatch):
    def answer(prompt, model, system_instruction):
        assert 'Required output language: Roman Telugu' in system_instruction
        assert 'Deadline is 12 June.' in prompt
        return type('Answer', (), {'text': 'June 12 lopu submit cheyyi. [S1]'})()

    monkeypatch.setattr(main, 'retrieve_context', lambda *args: main.format_evidence([('Deadline is 12 June.', {'source': 'notice.pdf', 'page': 5})]))
    monkeypatch.setattr(main, 'generate', answer)
    response = client.post('/ask', headers=headers(client), json={
        'question': 'Summarize the file. Telugu English letters lo cheppu.',
    })
    assert response.status_code == 200
    assert 'submit cheyyi' in response.json()['answer']


def test_png_is_described_and_indexed_for_current_user(client, monkeypatch):
    captured = {}

    class Store:
        def get(self, **kwargs):
            return {'ids': [], 'metadatas': []}

        def add(self, **kwargs):
            captured.update(kwargs)

    def describe(prompt, model):
        assert prompt[1]['mime_type'] == 'image/png'
        return type('Answer', (), {'text': 'Orange sign reading TEST ROOM'})()

    monkeypatch.setattr(main, 'get_collection', lambda: Store())
    monkeypatch.setattr(main, 'generate', describe)
    monkeypatch.setattr(main, 'get_embeddings', lambda: type('Embed', (), {'embed_documents': lambda self, docs: [[.1]]})())
    auth = headers(client)
    response = client.post('/upload-pdf', headers=auth, files={'files': ('sign.png', b'\x89PNG\r\n\x1a\nimage')})
    assert response.status_code == 200
    assert captured['documents'] == ['Orange sign reading TEST ROOM']
    assert captured['metadatas'][0]['owner'] == client.get('/auth/me', headers=auth).json()['id']
    assert client.post('/upload-pdf', headers=auth, files={'files': ('bad.png', b'not an image')}).status_code == 400


def test_scanned_pdf_pages_map_back_to_original_page_numbers(monkeypatch):
    writer = PdfWriter()
    for _ in range(2):
        writer.add_blank_page(width=612, height=792)
    pdf = io.BytesIO()
    writer.write(pdf)

    def scan(prompt, model):
        assert prompt[1]['mime_type'] == 'application/pdf'
        return type('Answer', (), {'text': '```json\n["First scanned page", "Second scanned page"]\n```'})()

    monkeypatch.setattr(main, 'generate', scan)
    result = main.extract_chunks(pdf.getvalue(), 'scan.pdf')
    assert [(text, meta['page']) for text, meta in result] == [('First scanned page', 1), ('Second scanned page', 2)]

    monkeypatch.setattr(main, 'generate', lambda *a: type('Answer', (), {'text': 'unexpected output'})())
    with pytest.raises(HTTPException) as error:
        main.extract_chunks(pdf.getvalue(), 'scan.pdf')
    assert error.value.status_code == 502


def test_keyword_search_recovers_invoice_id_missed_by_vector_search(monkeypatch, tmp_path):
    import chromadb

    collection = chromadb.PersistentClient(path=str(tmp_path)).get_or_create_collection('test_invoice_search')
    collection.add(
        ids=['exact', 'other-owner'] + [f'distractor-{i}' for i in range(12)],
        documents=['Invoice PO-19072. Total INR 4,900.', 'Invoice PO-19072. Total INR 9,999.']
        + ['Invoices usually mention a purchase order and total.'] * 12,
        embeddings=[[0.0, 1.0], [1.0, 0.0]] + [[1.0, 0.0]] * 12,
        metadatas=[{'owner': 'mine', 'source': 'invoice.pdf', 'page': 3},
                   {'owner': 'theirs', 'source': 'invoice.pdf', 'page': 1}]
        + [{'owner': 'mine', 'source': 'guide.pdf', 'page': 1}] * 12,
    )
    monkeypatch.setattr(main, 'get_collection', lambda: collection)
    monkeypatch.setattr(main, 'get_embeddings', lambda: type('Embed', (), {'embed_query': lambda self, q: [1.0, 0.0]})())
    context, sources = main.retrieve_context('What is the total for PO-19072?', 'mine')
    assert '4,900' in context and '9,999' not in context
    assert any(source['source'] == 'invoice.pdf' and source['page'] == 3 for source in sources)
    assert main.retrieve_context('What about guide.pdf?', 'mine', document='missing.pdf') == ('', [])
    _, scoped = main.retrieve_context('What is the total in invoice.pdf?', 'mine')
    assert {source['source'] for source in scoped} == {'invoice.pdf'}


def test_stream_and_json_answers_use_only_cited_excerpts(client, monkeypatch):
    def generate(*args, stream=False, **kwargs):
        text = ['Total INR 4,900. [S', '2] [S99]']
        chunks = [type('Answer', (), {'text': part})() for part in text]
        return iter(chunks) if stream else type('Answer', (), {'text': ''.join(text)})()

    evidence = main.format_evidence([
        ('Payment terms: 30 days.', {'source': 'invoice.pdf', 'page': 1}),
        ('Total INR 4,900.', {'source': 'invoice.pdf', 'page': 3}),
    ])
    monkeypatch.setattr(main, 'retrieve_context', lambda *args: evidence)
    monkeypatch.setattr(main, 'generate', generate)
    auth = headers(client)
    payload = {'question': 'What is the invoice total?'}
    result = client.post('/ask', headers=auth, json=payload).json()
    assert result['answer'] == 'Total INR 4,900. [S2]'
    assert result['sources'] == [evidence[1][1]]
    stream = client.post('/ask-stream', headers=auth, json=payload)
    events = [json.loads(line.removeprefix('data: ')) for line in stream.text.splitlines() if line.startswith('data: ')]
    assert events[-2] == {'type': 'sources', 'sources': result['sources']}
    assert events[-1] == {'type': 'done', 'answer': result['answer']}

    monkeypatch.setattr(main, 'generate', lambda *args, **kwargs: type('Answer', (), {'text': 'Unsupported total. [S99]'})())
    unsupported = client.post('/ask', headers=auth, json=payload).json()
    assert 'Unsupported total' not in unsupported['answer']
    assert unsupported['sources'] == []


def test_duplicate_document_name_cannot_mix_excerpts(client, monkeypatch):
    class Store:
        def get(self, where, include):
            assert where == {'owner': owner}
            return {'ids': ['existing'], 'metadatas': [{'source': 'invoice.pdf'}]}

    auth = headers(client)
    owner = client.get('/auth/me', headers=auth).json()['id']
    monkeypatch.setattr(main, 'get_collection', lambda: Store())
    monkeypatch.setattr(main, 'extract_chunks', lambda data, name: [('text', {'source': name, 'page': 1})])
    response = client.post('/upload-pdf', headers=auth, files={'files': ('Invoice.pdf', b'%PDF-test')})
    assert response.status_code == 409
    assert 'already indexed' in response.json()['detail']
