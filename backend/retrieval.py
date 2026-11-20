"""Rank document excerpts and resolve answer citations."""
import math
import re
from collections import Counter, defaultdict

TOKEN = re.compile(r'[^\W_]+')
CITATION = re.compile(r'\[S[0-9]+\]', re.I)
STOP_WORDS = frozenset(
    'a an and are as at be by can could did do does for from how i in is it me my of on '
    'or please show tell that the their them there these they this to was were what when '
    'where which who why will with would you your pdf document file explain'.split()
)


def terms(text):
    return [word for word in TOKEN.findall(text.casefold()) if word not in STOP_WORDS]


def keyword_order(entries, question):
    """Rank exact matches with BM25, using only the selected workspace excerpts."""
    query = sorted(set(terms(question)))
    if not query or not entries:
        return []
    counts = {key: Counter(terms(text)) for key, (text, _) in entries.items()}
    lengths = {key: sum(words.values()) for key, words in counts.items()}
    average_length = sum(lengths.values()) / len(entries) or 1
    scores = defaultdict(float)
    for word in query:
        matching = [(key, words[word]) for key, words in counts.items() if word in words]
        idf = math.log1p((len(entries) - len(matching) + 0.5) / (len(matching) + 0.5))
        for key, frequency in matching:
            normalization = 0.25 + 0.75 * lengths[key] / average_length
            scores[key] += idf * (frequency * 2.2) / (frequency + 1.2 * normalization)
    return sorted(scores, key=lambda key: (-scores[key], key))


def hybrid_order(semantic, keyword, limit):
    """Fuse ranks without treating vector distances and keyword scores as comparable."""
    scores = defaultdict(float)
    for ranking in (semantic, keyword):
        for rank, key in enumerate(ranking, 1):
            scores[key] += 1 / (10 + rank)
    ranked = sorted(scores, key=scores.get, reverse=True)
    # Reserve a slot for each search's best result if fusion would drop it.
    required = set(semantic[:1] + keyword[:1])
    selected = required.union([key for key in ranked if key not in required][:limit - len(required)])
    return [key for key in ranked if key in selected]


def overview_entries(entries, limit=16):
    groups = defaultdict(list)
    for excerpt, meta in sorted(entries, key=lambda entry: (
        entry[1]['source'], entry[1].get('page', 1), entry[1].get('offset', 0),
    )):
        groups[meta['source']].append((excerpt, meta))

    allocation = dict.fromkeys(groups, 0)
    slots = min(limit, len(entries))
    while slots:
        for name, group in groups.items():
            if allocation[name] < len(group):
                allocation[name] += 1
                slots -= 1
                if not slots:
                    break

    sampled = []
    for name, group in groups.items():
        count = allocation[name]
        if count == 1:
            sampled.append(group[0])
        elif count > 1:
            sampling_indices = [i * (len(group) - 1) // (count - 1) for i in range(count)]
            sampled.extend(group[index] for index in sampling_indices)
    return sampled


def format_evidence(entries):
    excerpts, sources = [], []
    for index, (text, meta) in enumerate(entries, 1):
        source = {'id': f'S{index}', 'source': meta['source'], 'page': meta.get('page'), 'snippet': text}
        sources.append(source)
        excerpts.append(f"[{source['id']}] {source['source']}, page {source['page'] or 'unknown'}\n{text}")
    return '\n\n'.join(excerpts), sources


def resolve_citations(answer, sources):
    available = {source['id']: source for source in sources}
    cited = {}

    def resolve(match):
        label = match[0][1:-1].upper()
        if label in available:
            cited[label] = available[label]
            return f'[{label}]'
        return ''

    resolved = CITATION.sub(resolve, answer).strip()
    if not CITATION.sub('', resolved).strip():
        return '', []
    return resolved, list(cited.values())
