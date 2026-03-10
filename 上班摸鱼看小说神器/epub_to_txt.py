import os
import posixpath
import re
import html
import zipfile
import argparse
from html.parser import HTMLParser
import xml.etree.ElementTree as ET

class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._skip += 1
        if tag in ("p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li"):
            self.parts.append("\n")
        if tag == "br":
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self._skip > 0:
            self._skip -= 1
        if tag in ("p", "div", "li"):
            self.parts.append("\n")

    def handle_data(self, data):
        if self._skip > 0:
            return
        s = data.strip()
        if s:
            self.parts.append(s)

    def get_text(self):
        text = "".join(self.parts)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

def decode_with_guess(b: bytes) -> str:
    m = re.search(br'encoding=["\']([a-z0-9_\-]+)["\']', b[:256].lower())
    enc = None
    if m:
        try:
            enc = m.group(1).decode("ascii", "ignore")
        except Exception:
            enc = None
    candidates = [enc, "utf-8", "gb18030", "latin-1"]
    for e in candidates:
        if not e:
            continue
        try:
            return b.decode(e)
        except Exception:
            continue
    return b.decode("utf-8", "ignore")

def get_opf_path(z: zipfile.ZipFile) -> str:
    data = z.read("META-INF/container.xml")
    xml = decode_with_guess(data)
    root = ET.fromstring(xml)
    for rf in root.findall('.//{*}rootfile'):
        p = rf.attrib.get("full-path")
        if p:
            return p
    raise RuntimeError("OPF not found")

def get_spine_hrefs(opf_xml: str, opf_dir: str) -> list:
    root = ET.fromstring(opf_xml)
    manifest = {}
    manifest_items = []
    for item in root.findall('.//{*}manifest/{*}item'):
        iid = item.attrib.get("id")
        href = item.attrib.get("href")
        mt = item.attrib.get("media-type")
        manifest_items.append((iid, href, mt))
        if iid and href:
            manifest[iid] = href
    hrefs = []
    for ref in root.findall('.//{*}spine/{*}itemref'):
        idref = ref.attrib.get("idref")
        if idref and idref in manifest:
            hrefs.append(manifest[idref])
    return [posixpath.normpath(posixpath.join(opf_dir, h)) for h in hrefs]

def get_ncx_path_from_opf(opf_xml: str, opf_dir: str) -> str | None:
    root = ET.fromstring(opf_xml)
    for item in root.findall('.//{*}manifest/{*}item'):
        mt = item.attrib.get("media-type")
        href = item.attrib.get("href")
        if mt == "application/x-dtbncx+xml" and href:
            return posixpath.normpath(posixpath.join(opf_dir, href))
    return None

def get_hrefs_from_ncx(ncx_xml: str, ncx_dir: str) -> list:
    root = ET.fromstring(ncx_xml)
    order = []
    for np in root.findall('.//{*}navMap/{*}navPoint'):
        c = np.find('.//{*}content')
        if c is not None:
            src = c.attrib.get("src")
            if src:
                order.append(posixpath.normpath(posixpath.join(ncx_dir, src)))
    return order

def list_all_html_like(z: zipfile.ZipFile) -> list:
    names = z.namelist()
    htmls = [n for n in names if n.lower().endswith(('.xhtml', '.html', '.htm'))]
    htmls.sort()
    return htmls

def extract_text_from_html(html_str: str) -> str:
    parser = TextExtractor()
    parser.feed(html_str)
    txt = parser.get_text()
    return html.unescape(txt)

def convert_epub_to_txt(epub_path: str, out_dir: str | None = None, verbose: bool = False) -> str:
    with zipfile.ZipFile(epub_path) as z:
        opf_path = get_opf_path(z)
        opf_dir = posixpath.dirname(opf_path)
        opf_xml = decode_with_guess(z.read(opf_path))
        spine_files = get_spine_hrefs(opf_xml, opf_dir)
        texts = []
        ordered_files = spine_files[:]
        if not ordered_files:
            ncx_path = get_ncx_path_from_opf(opf_xml, opf_dir)
            if ncx_path:
                try:
                    ncx_xml = decode_with_guess(z.read(ncx_path))
                    ordered_files = get_hrefs_from_ncx(ncx_xml, os.path.dirname(ncx_path))
                except Exception:
                    ordered_files = []
        if not ordered_files:
            ordered_files = list_all_html_like(z)
        seen = set()
        dedup = []
        for f in ordered_files:
            if f in seen:
                continue
            seen.add(f)
            dedup.append(f)
        if verbose:
            print(f"Chapters: {len(dedup)}")
        for f in dedup:
            try:
                content = z.read(f)
            except KeyError:
                continue
            html_str = decode_with_guess(content)
            t = extract_text_from_html(html_str)
            if t:
                texts.append(t)
        final = "\n\n".join(texts)
        final = final.strip()
    base = os.path.splitext(os.path.basename(epub_path))[0]
    if not out_dir:
        out_dir = os.path.dirname(epub_path)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, base + ".txt")
    with open(out_path, "w", encoding="utf-8", newline="\n") as w:
        w.write(final)
    return out_path

def run_on_path(input_path: str, out_dir: str | None, verbose: bool = False):
    if os.path.isdir(input_path):
        files = [os.path.join(input_path, f) for f in os.listdir(input_path) if f.lower().endswith(".epub")]
        if not files:
            print("No EPUB files found")
            return
        for fp in files:
            outp = convert_epub_to_txt(fp, out_dir, verbose=verbose)
            print(outp)
    else:
        outp = convert_epub_to_txt(input_path, out_dir, verbose=verbose)
        print(outp)

def find_epub_files(base_dir: str) -> list:
    files = []
    for r, d, fns in os.walk(base_dir):
        for n in fns:
            if n.lower().endswith(".epub"):
                files.append(os.path.join(r, n))
    files.sort()
    return files

def interactive_select_and_convert(base_dir: str, out_dir: str | None, verbose: bool = False):
    files = find_epub_files(base_dir)
    if not files:
        print("No EPUB files found")
        return
    print("Found EPUB files:")
    for i, fp in enumerate(files, 1):
        print(f"{i}. {os.path.relpath(fp, base_dir)}")
    while True:
        sel = input("Enter number to convert, or q to quit: ").strip()
        if sel.lower() in ("q", "quit", "exit"):
            return
        if not sel.isdigit():
            print("Invalid input")
            continue
        idx = int(sel)
        if idx < 1 or idx > len(files):
            print("Out of range")
            continue
        target = files[idx - 1]
        outp = convert_epub_to_txt(target, out_dir, verbose=verbose)
        print(outp)
        return

def main():
    parser = argparse.ArgumentParser(prog="epub_to_txt", description="Convert EPUB to TXT")
    parser.add_argument("input", nargs="?", help="EPUB file or directory containing EPUB files", default=None)
    parser.add_argument("-o", "--out", help="Output directory", default=None)
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose output")
    args = parser.parse_args()
    if args.input is None:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        interactive_select_and_convert(base_dir, args.out, verbose=args.verbose)
    else:
        run_on_path(args.input, args.out, verbose=args.verbose)

if __name__ == "__main__":
    main()