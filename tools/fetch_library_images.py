"""Free-licensed pictures for the Tech Encyclopedia, from Wikimedia.

Modes (python3 tools/fetch_library_images.py <mode>):
  lead     For every card, try candidate Wikipedia articles in order and use the
           first free-licensed lead image (pilicense=free).
  review   For the cards in REVIEW_QUERIES, search Wikimedia Commons for photos
           and save up to 4 small candidates per card to images/library/_review/
           with candidates.json, so a person can pick the best one.
  apply    Download the files listed in tools/library_image_picks.json
           ({"card": "File name.jpg"}), update credits.js, delete _review/.
  optimize Re-encode every image in images/library as 640 px WebP (needs Pillow).

Images whose Commons metadata says non-free are always rejected. Author,
license and source go to images/library/credits.js, which the game shows under
each picture. Runs in GitHub Actions (.github/workflows/library-images.yml),
because the development sandbox cannot reach Wikimedia.
"""
import html
import io
import json
import sys
import pathlib
import re
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'images' / 'library'
API = 'https://en.wikipedia.org/w/api.php'
COMMONS = 'https://commons.wikimedia.org/w/api.php'
REVIEW = OUT / '_review'
PICKS = ROOT / 'tools' / 'library_image_picks.json'
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


# Cards whose lead image was a logo, a diagram, off-topic or missing: Commons photo searches.
REVIEW_QUERIES = {
    'egov': ['ASAN xidmət', 'e-government service center citizens'],
    'mbank': ['M-Pesa agent shop', 'mobile money phone Africa'],
    'fintech': ['contactless payment terminal card', 'fintech startup office'],
    'g5': ['5G antenna base station', '5G mast'],
    'opendata': ['open data hackathon', 'open data day'],
    'cloud': ['server racks data center aisle', 'cloud server hall'],
    'pay': ['QR code payment shop', 'Pix QR code pagamento'],
    'ehealth': ['doctor tablet electronic health record', 'hospital computer patient record'],
    'auto': ['Waymo self-driving car street', 'autonomous vehicle lidar'],
    'biotech': ['biotechnology laboratory pipette', 'DNA sequencing laboratory'],
    'space': ['Starlink user terminal dish', 'Starlink satellites night sky'],
    'fusion': ['ITER tokamak construction', 'JET tokamak interior'],
    'ai': ['AlphaGo Lee Sedol', 'artificial intelligence robot exhibition'],
    'e4': ['Ethereum conference Devcon', 'blockchain cryptocurrency mining'],
    'e5': ['mobile banking app smartphone', 'online banking laptop'],
    'e6': ['stock exchange trading floor', 'digital asset blockchain'],
    'e7': ['electronic invoice', 'receipt invoice paper'],
    's2': ['Khan Academy', 'student laptop online learning'],
    's3': ['electronic signature tablet', 'signing document stylus tablet'],
    's4': ['rural internet access village computer', 'fiber broadband installation'],
    'c1': ['firewall appliance network', 'network security appliance rack'],
    'c2': ['cyber security operations center', 'CERT cybersecurity team'],
    'c3': ['HTTPS padlock browser', 'smart card reader certificate'],
    'c4': ['security key two-factor authentication', 'YubiKey'],
    'c6': ['IBM Quantum System One', 'quantum computer cryostat'],
    'c7': ['tape library backup', 'backup hard drives'],
    'i2': ['network router cables', 'internet router rack'],
    'i5': ['cell tower edge computing', 'factory automation sensors'],
    'i6': ['smart meter electricity', 'electricity substation'],
    'a1': ['IBM 701', 'Arthur Samuel checkers'],
    'a2': ['data visualization wall control room', 'big data dashboard screens'],
    'a3': ['GPU server cluster', 'NVIDIA GPU'],
    'a4': ['GPU supercomputer AI training', 'large language model'],
    'a5': ['Peter Shor', 'quantum processor chip'],
    'a6': ['IBM TrueNorth', 'neuromorphic chip'],
    'a7': ['AI Safety Summit Bletchley Park', 'Bletchley Park'],
    'n1': ['data center cooling', 'free cooling data centre'],
    'n5': ['factory chimney emissions', 'smokestack pollution'],
    'n6': ['hydrogen electrolyzer', 'hydrogen fuel station'],
    'n7': ['battery energy storage system container', 'grid battery storage'],
}

def api(params, endpoint=None):
    params = {**params, 'format': 'json', 'formatversion': '2'}
    req = urllib.request.Request((endpoint or API) + '?' + urllib.parse.urlencode(params), headers={'User-Agent': UA})
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


def load_credits():
    path = OUT / 'credits.js'
    if not path.exists():
        return {}
    text = path.read_text(encoding='utf-8')
    body = text[text.index('=') + 1:].strip().rstrip(';')
    return json.loads(body) if body else {}


def save_credits(credits, report):
    credits = dict(sorted(credits.items()))
    js = ('// Generated by tools/fetch_library_images.py. Do not edit by hand.\n'
          '// Free-licensed images from Wikimedia Commons / Wikipedia, with author and license.\n'
          'const LIBRARY_IMAGES = ' + json.dumps(credits, indent=2, ensure_ascii=False) + ';\n')
    (OUT / 'credits.js').write_text(js, encoding='utf-8')
    (OUT / 'REPORT.txt').write_text('\n'.join(report) + '\n', encoding='utf-8')
    print('\n'.join(report))
    print(f'{len(credits)} cards have an image')


def save_image(card, info, credits, article=''):
    ext = pathlib.Path(urllib.parse.urlparse(info['thumb']).path).suffix.lower() or '.jpg'
    if ext not in ('.jpg', '.jpeg', '.png', '.gif', '.webp'):
        ext = '.png'
    for old in OUT.glob(card + '.*'):
        old.unlink()
    dest = OUT / (card + ext)
    download(info['thumb'], dest)
    credits[card] = {
        'src': f'images/library/{card}{ext}', 'article': article, 'file': info['file'],
        'artist': info['artist'], 'license': info['license'], 'licenseUrl': info['licenseUrl'], 'source': info['source'],
    }


def mode_lead():
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
        info['file'] = name
        save_image(card, info, credits, title)
        used.add(name)
        report.append(f'{card}: {title} -> {name} ({info["license"]})')
        time.sleep(0.3)
    save_credits(credits, report)


def commons_search(query, limit=8):
    data = api({'action': 'query', 'generator': 'search', 'gsrnamespace': 6, 'gsrsearch': query + ' filetype:bitmap',
                'gsrlimit': limit, 'prop': 'imageinfo', 'iiprop': 'url|extmetadata|size', 'iiurlwidth': 240}, COMMONS)
    pages = sorted(data.get('query', {}).get('pages', []), key=lambda p: p.get('index', 0))
    out = []
    for page in pages:
        if 'imageinfo' not in page:
            continue
        info = page['imageinfo'][0]
        meta = info.get('extmetadata', {})
        license_name = plain(meta.get('LicenseShortName', {}).get('value', ''), 60)
        nonfree = str(meta.get('NonFree', {}).get('value', '')).lower() in ('true', '1', 'yes')
        if nonfree or not license_name or re.search(r'fair use|non-free', license_name, re.I):
            continue
        if info.get('width', 0) < 800 or info.get('height', 0) < 450:
            continue
        out.append({'file': page['title'].removeprefix('File:'), 'thumb': info.get('thumburl'),
                    'artist': plain(meta.get('Artist', {}).get('value', '')) or 'Unknown author', 'license': license_name})
    return out


def mode_review():
    REVIEW.mkdir(parents=True, exist_ok=True)
    report, found = [], {}
    for card, queries in REVIEW_QUERIES.items():
        picks, seen = [], set()
        for q in queries:
            try:
                taken = 0
                for c in commons_search(q):
                    if c['file'] in seen or taken >= 3:
                        continue
                    seen.add(c['file'])
                    picks.append(c)
                    taken += 1
            except Exception as exc:
                report.append(f'{card}: search error "{q}": {exc}')
            time.sleep(0.3)
        picks = picks[:4]
        for i, c in enumerate(picks):
            try:
                ext = pathlib.Path(urllib.parse.urlparse(c['thumb']).path).suffix.lower() or '.jpg'
                download(c['thumb'], REVIEW / f'{card}_{i}{ext}')
                c['thumbFile'] = f'{card}_{i}{ext}'
            except Exception as exc:
                report.append(f'{card}: download error {c["file"]}: {exc}')
            time.sleep(0.2)
        found[card] = picks
        report.append(f'{card}: {len(picks)} candidates')
    (REVIEW / 'candidates.json').write_text(json.dumps(found, indent=2, ensure_ascii=False), encoding='utf-8')
    (REVIEW / 'REPORT.txt').write_text('\n'.join(report) + '\n', encoding='utf-8')
    print('\n'.join(report))


def mode_apply():
    picks = json.loads(PICKS.read_text(encoding='utf-8'))
    credits, report = load_credits(), []
    for card, name in picks.items():
        if not name:  # an empty pick removes the card's image
            for old in OUT.glob(card + '.*'):
                old.unlink()
            credits.pop(card, None)
            report.append(f'{card}: image removed')
            continue
        try:
            info = file_info(name)
            if not info:
                report.append(f'{card}: {name} rejected (not free or missing)')
                continue
            info['file'] = name
            save_image(card, info, credits, 'Wikimedia Commons')
            report.append(f'{card}: {name} ({info["license"]})')
        except Exception as exc:
            report.append(f'{card}: error {name}: {exc}')
        time.sleep(0.3)
    if REVIEW.exists():
        for f in REVIEW.iterdir():
            f.unlink()
        REVIEW.rmdir()
    save_credits(credits, report)


def mode_optimize():
    from PIL import Image  # installed by the workflow
    credits, report = load_credits(), []
    for card, c in credits.items():
        src = ROOT / c['src']
        if not src.exists():
            continue
        im = Image.open(src)
        if im.mode in ('RGBA', 'LA', 'P'):
            im = im.convert('RGBA')
            bg = Image.new('RGB', im.size, (255, 255, 255))
            bg.paste(im, mask=im.split()[-1])
            im = bg
        else:
            im = im.convert('RGB')
        if im.width > WIDTH:
            im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
        dest = OUT / f'{card}.webp'
        before = src.stat().st_size
        im.save(dest, 'WEBP', quality=78, method=6)
        if src != dest:
            src.unlink()
        c['src'] = f'images/library/{card}.webp'
        report.append(f'{card}: {before // 1024} KB -> {dest.stat().st_size // 1024} KB')
    save_credits(credits, report)


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'lead'
    {'lead': mode_lead, 'review': mode_review, 'apply': mode_apply, 'optimize': mode_optimize}[mode]()
