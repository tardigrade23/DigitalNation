"""Download one free-licensed photo or diagram per Tech Encyclopedia card.

For every card, candidate Wikipedia articles are tried in order. The article's
lead image is used only if Wikipedia reports it as free (pilicense=free) and
Commons metadata does not mark it non-free. A 640 px thumbnail is saved to
images/library/<id>.<ext>, and author + license go to images/library/credits.js,
which the game shows under each picture.

Runs in GitHub Actions (see .github/workflows/library-images.yml), because the
development sandbox cannot reach Wikimedia. Standard library only.
"""
import html
import json
import pathlib
import re
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'images' / 'library'
API = 'https://en.wikipedia.org/w/api.php'
UA = 'DigitalNationGame/1.0 (educational game; https://github.com/tardigrade23/DigitalNation)'
WIDTH = 640

# card id -> candidate English Wikipedia articles, best first
CANDIDATES = {
    # sectors
    'isp': ['Internet service provider', 'Modem', 'Server room'],
    'egov': ['ASAN Service', 'E-government', 'X-Road'],
    'mbank': ['Mobile banking', 'M-Pesa', 'Mobile payment'],
    'fiber': ['Optical fiber', 'Fiber-optic cable'],
    'fintech': ['Financial technology', 'Contactless payment'],
    'dc': ['Data center', 'Server room'],
    'digid': ['Estonian identity card', 'Identity document', 'Aadhaar'],
    'g5': ['5G', 'Cell site'],
    'opendata': ['Open data', 'Data.gov'],
    'cloud': ['Cloud computing', 'Server farm'],
    'pay': ['Pix (payment system)', 'Unified Payments Interface', 'QR code'],
    'ehealth': ['Electronic health record', 'Health informatics'],
    'iot': ['Internet of things', 'Smart meter'],
    'smart': ['Smart city', 'Marina Bay, Singapore'],
    'edu': ['Educational technology', 'Massive open online course'],
    'ai': ['Artificial intelligence', 'Dartmouth workshop'],
    'robotics': ['Industrial robot', 'Robot'],
    'auto': ['Self-driving car', 'Waymo'],
    'chip': ['Semiconductor device fabrication', 'Wafer (electronics)', 'Cleanroom'],
    'quantum': ['Quantum computing', 'Superconducting quantum computing'],
    'biotech': ['CRISPR', 'Biotechnology'],
    'space': ['Starlink', 'Communications satellite'],
    'fusion': ['ITER', 'National Ignition Facility', 'Tokamak'],
    'agency': ['Sputnik 1', 'Rocket launch'],
    # research: economy
    'e1': ['Tax return', 'Tax'],
    'e2': ['E-commerce', 'Online shopping'],
    'e3': ['Central bank digital currency', 'Digital currency'],
    'e4': ['Smart contract', 'Ethereum'],
    'e5': ['Open banking', 'API'],
    'e6': ['Tokenization (data security)', 'Blockchain'],
    'e7': ['Electronic invoicing', 'Invoice'],
    # society
    's1': ['Medical record', 'Electronic health record'],
    's2': ['Khan Academy', 'Distance education', 'Educational technology'],
    's3': ['Electronic signature', 'Digital signature'],
    's4': ['Broadband', 'Internet access'],
    's5': ['Electronic voting in Estonia', 'Electronic voting'],
    's6': ['Telehealth', 'Telemedicine'],
    's7': ['Digital literacy', 'Media literacy'],
    # security
    'c1': ['Firewall (computing)'],
    'c2': ['Cyber threat intelligence', 'Computer emergency response team'],
    'c3': ['Public key infrastructure', 'Public-key cryptography'],
    'c4': ['Zero trust security model', 'Computer security'],
    'c5': ['Intrusion detection system', 'Security operations center'],
    'c6': ['Post-quantum cryptography', 'Lattice-based cryptography'],
    'c7': ['Backup', 'Disaster recovery'],
    # infrastructure
    'i1': ['Internet protocol suite', 'ARPANET'],
    'i2': ['IPv6', 'IPv6 address'],
    'i3': ['Virtualization', 'Hypervisor'],
    'i4': ['Internet exchange point', 'DE-CIX'],
    'i5': ['Edge computing', 'Cell site'],
    'i6': ['Smart grid', 'Smart meter'],
    'i7': ['Digital twin', 'Building information modeling'],
    # science & AI
    'a1': ['Machine learning', 'Arthur Samuel (computer scientist)'],
    'a2': ['Big data', 'Data visualization'],
    'a3': ['Deep learning', 'Neural network (machine learning)'],
    'a4': ['Transformer (deep learning architecture)', 'Attention Is All You Need'],
    'a5': ["Shor's algorithm", 'Quantum algorithm'],
    'a6': ['Neuromorphic computing', 'Cognitive computer'],
    'a7': ['AI alignment', 'AI safety'],
    # green tech
    'n1': ['Green computing', 'Data center'],
    'n2': ['Renewable energy', 'Wind farm', 'Solar power'],
    'n3': ['Electronic waste', 'Computer recycling'],
    'n4': ['Bicycle-sharing system', 'Tallinn'],
    'n5': ['Carbon accounting', 'Greenhouse gas emissions'],
    'n6': ['Green hydrogen', 'Electrolysis of water'],
    'n7': ['Grid energy storage', 'Pumped-storage hydroelectricity'],
}


def api(params):
    params = {**params, 'format': 'json', 'formatversion': '2'}
    req = urllib.request.Request(API + '?' + urllib.parse.urlencode(params), headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def lead_image(title):
    data = api({'action': 'query', 'prop': 'pageimages', 'piprop': 'name', 'pilicense': 'free', 'redirects': 1, 'titles': title})
    pages = data.get('query', {}).get('pages', [])
    return pages[0].get('pageimage') if pages and not pages[0].get('missing') else None


def plain(value, limit=90):
    text = html.unescape(re.sub(r'<[^>]+>', ' ', value or ''))
    text = re.sub(r'\s+', ' ', text).strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + '…'


def file_info(name):
    data = api({'action': 'query', 'titles': 'File:' + name, 'prop': 'imageinfo', 'iiprop': 'url|extmetadata|mime', 'iiurlwidth': WIDTH})
    pages = data.get('query', {}).get('pages', [])
    if not pages or 'imageinfo' not in pages[0]:
        return None
    info = pages[0]['imageinfo'][0]
    meta = info.get('extmetadata', {})
    if str(meta.get('NonFree', {}).get('value', '')).lower() in ('true', '1', 'yes'):
        return None
    license_name = plain(meta.get('LicenseShortName', {}).get('value', ''), 60)
    if not license_name or re.search(r'fair use|non-free', license_name, re.I):
        return None
    return {
        'thumb': info.get('thumburl') or info.get('url'),
        'source': info.get('descriptionurl', ''),
        'artist': plain(meta.get('Artist', {}).get('value', '')) or 'Unknown author',
        'license': license_name,
        'licenseUrl': meta.get('LicenseUrl', {}).get('value', ''),
    }


def download(url, dest):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        dest.write_bytes(r.read())


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    credits, used, report = {}, set(), []
    for card, titles in CANDIDATES.items():
        chosen = None
        for title in titles:
            try:
                name = lead_image(title)
                time.sleep(0.2)
                if not name or name in used:
                    continue
                info = file_info(name)
                time.sleep(0.2)
                if info and info['thumb']:
                    chosen = (title, name, info)
                    break
            except Exception as exc:  # keep going; one bad article should not stop the run
                report.append(f'{card}: error on "{title}": {exc}')
        if not chosen:
            report.append(f'{card}: no free image found')
            continue
        title, name, info = chosen
        ext = pathlib.Path(urllib.parse.urlparse(info['thumb']).path).suffix.lower() or '.jpg'
        if ext not in ('.jpg', '.jpeg', '.png', '.gif', '.webp'):
            ext = '.png'
        for old in OUT.glob(card + '.*'):
            old.unlink()
        dest = OUT / (card + ext)
        download(info['thumb'], dest)
        used.add(name)
        credits[card] = {
            'src': f'images/library/{card}{ext}',
            'article': title,
            'file': name,
            'artist': info['artist'],
            'license': info['license'],
            'licenseUrl': info['licenseUrl'],
            'source': info['source'],
        }
        report.append(f'{card}: {title} -> {name} ({info["license"]})')
        time.sleep(0.3)

    js = ('// Generated by tools/fetch_library_images.py. Do not edit by hand.\n'
          '// Free-licensed images from Wikimedia Commons / Wikipedia, with author and license.\n'
          'const LIBRARY_IMAGES = ' + json.dumps(credits, indent=2, ensure_ascii=False) + ';\n')
    (OUT / 'credits.js').write_text(js, encoding='utf-8')
    (OUT / 'REPORT.txt').write_text('\n'.join(report) + '\n', encoding='utf-8')
    print('\n'.join(report))
    print(f'{len(credits)} of {len(CANDIDATES)} cards have an image')


if __name__ == '__main__':
    main()
