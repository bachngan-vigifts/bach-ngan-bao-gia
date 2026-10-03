"""Split the approved Bach Ngan master contract into standalone DOCX templates."""

from copy import deepcopy
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from lxml import etree


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "mau-hop-dong-bach-ngan.docx"
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}


def text(element):
    return "".join(element.xpath(".//w:t/text()", namespaces=NS))


def set_text(element, value):
    text_nodes = element.xpath(".//w:t", namespaces=NS)
    if not text_nodes:
        paragraph = etree.SubElement(element, f"{{{W}}}p")
        run = etree.SubElement(paragraph, f"{{{W}}}r")
        text_nodes = [etree.SubElement(run, f"{{{W}}}t")]
    text_nodes[0].set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    text_nodes[0].text = value
    for node in text_nodes[1:]:
        node.text = ""


def paragraph_start(nodes, phrase):
    return next(index for index, node in enumerate(nodes) if phrase in text(node))


def preceding_national_header(nodes, index):
    return max(
        candidate
        for candidate in range(index - 1, -1, -1)
        if "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" in text(nodes[candidate])
    )


def tune_acceptance_template(root):
    for row in root.xpath("//w:tr", namespaces=NS):
        if "Related Chi tiết đơn hàngs" not in text(row):
            continue
        cells = row.xpath("./w:tc", namespaces=NS)
        if cells:
            set_text(cells[-1], "<<[Đóng gói]>>")
        break
    for paragraph in root.xpath("//w:p", namespaces=NS):
        if text(paragraph).strip().startswith("Đại diện nghiệm thu"):
            set_text(paragraph, "Đại diện nghiệm thu: <<[Bên A]>>    Chức vụ: <<[Chức vụ]>>")
            break


def write_template(files, nodes, start, end, destination, tune=None):
    root = etree.fromstring(files["word/document.xml"])
    body = root.find("w:body", NS)
    section = body.find("w:sectPr", NS)
    for child in list(body):
        if child is not section:
            body.remove(child)
    insertion_index = list(body).index(section)
    for node in nodes[start:end]:
        body.insert(insertion_index, deepcopy(node))
        insertion_index += 1
    if tune:
        tune(root)
    output_files = dict(files)
    output_files["word/document.xml"] = etree.tostring(
        root, xml_declaration=True, encoding="UTF-8", standalone=True
    )
    with ZipFile(destination, "w", ZIP_DEFLATED) as archive:
        for path, content in output_files.items():
            archive.writestr(path, content)


def main():
    with ZipFile(SOURCE) as archive:
        files = {name: archive.read(name) for name in archive.namelist()}
    root = etree.fromstring(files["word/document.xml"])
    nodes = list(root.find("w:body", NS))
    acceptance_title = paragraph_start(nodes, "BIÊN BẢN BÀN GIAO VÀ")
    advance_title = paragraph_start(nodes, "ĐỀ NGHỊ TẠM ỨNG")
    acceptance_start = preceding_national_header(nodes, acceptance_title)
    advance_start = preceding_national_header(nodes, advance_title)
    destination = ROOT / "public"
    write_template(files, nodes, 0, acceptance_start, destination / "mau-hop-dong-bach-ngan-hdkt.docx")
    write_template(
        files,
        nodes,
        acceptance_start,
        advance_start,
        destination / "mau-hop-dong-bach-ngan-bien-ban.docx",
        tune_acceptance_template,
    )
    write_template(files, nodes, advance_start, len(nodes) - 1, destination / "mau-hop-dong-bach-ngan-tam-ung.docx")


if __name__ == "__main__":
    main()
