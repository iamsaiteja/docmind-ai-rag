import io

import pytest
from fastapi import HTTPException
from pypdf import PdfWriter

import main
from test_privacy import client, headers


def test_file_overview_uses_first_pages_and_preserves_owner_filter(monkeypatch):
    class Store:
        def get(self, where, include):
            if include == ['metadatas']:
                assert where == {'owner': 'mine'}
                return {'metadatas': [{'source': 'notice.pdf'}]}
            assert where == {'$and': [{'owner': 'mine'}, {'source': 'notice.pdf'}]}
            return {'documents': ['Supplement', 'Exam OMR sheet instructions'],
                    'metadatas': [{'source': 'notice.pdf', 'page': 2}, {'source': 'notice.pdf', 'page': 1}]}

    monkeypatch.setattr(main, 'get_collection', lambda: Store())
    for question in ('What is that file?', 'U explain', 'Summarize'):
        context, sources = main.retrieve_context(question, 'mine', document='notice.pdf')
        assert context.startswith('[notice.pdf, page 1]\nExam OMR sheet instructions')
        assert sources[0]['source'] == 'notice.pdf'
        assert sources[0]['page'] == 1


def test_long_overview_considers_final_pages(monkeypatch):
    class Store:
        def get(self, where, include):
            assert where == {'owner': 'mine'}
            metadata = [{'source': 'notice.pdf', 'page': page} for page in range(1, 41)]
            return {'metadatas': metadata, 'documents': [f'Page {i}' for i in range(1, 41)]}

    monkeypatch.setattr(main, 'get_collection', lambda: Store())
    _, sources = main.retrieve_context('Summarize the document', 'mine')
    assert len(sources) == 16
    assert sources[0]['page'] == 1 and sources[-1]['page'] == 40


def test_detailed_question_keeps_selected_file_and_retrieves_more_evidence(monkeypatch):
    class Store:
        def get(self, where, include):
            if include:
                return {'metadatas': [{'source': 'notice.pdf'}, {'source': 'other.pdf'}]}
            return {'ids': list(range(18))}

        def query(self, **kwargs):
            assert kwargs['where'] == {'$and': [{'owner': 'mine'}, {'source': 'notice.pdf'}]}
            assert kwargs['n_results'] == 12
            return {'documents': [['Deadline is 12 June.']],
                    'metadatas': [[{'source': 'notice.pdf', 'page': 5}]]}

    monkeypatch.setattr(main, 'get_collection', lambda: Store())
    monkeypatch.setattr(main, 'get_embeddings', lambda: type('Embed', (), {'embed_query': lambda self, q: [.1]})())
    context, sources = main.retrieve_context('Explain the deadline in this PDF in detail', 'mine', document='notice.pdf')
    assert context == '[notice.pdf, page 5]\nDeadline is 12 June.'
    assert sources[0]['source'] == 'notice.pdf'


def test_png_is_described_and_indexed_for_current_user(client, monkeypatch):
    captured = {}

    class Store:
        def get(self, **kwargs):
            return {'ids': []}

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
