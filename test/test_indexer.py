from contextlib import closing
import tempfile
import unittest
from pathlib import Path
from sys import path as syspath
syspath.insert(0, str(Path(__file__).parents[1] / 'backend'))
from indexer import Index, extract
from docx import Document
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

class IndexerTest(unittest.TestCase):
    def test_text_pdf_word_index_incremental_and_delete(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'project.txt').write_text('Cobalt autumn launch budget is approved.')
            doc = Document(); doc.add_paragraph('Cobalt design review includes the Word report.'); doc.save(root / 'review.docx')
            writer = PdfWriter(); page = writer.add_blank_page(width=300, height=300)
            stream = DecodedStreamObject(); stream.set_data(b'BT /F1 12 Tf 40 250 Td (Cobalt quarterly PDF forecast) Tj ET')
            ref = writer._add_object(stream)
            page[NameObject('/Contents')] = ref
            page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): writer._add_object(DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')}))})})
            with (root / 'forecast.pdf').open('wb') as out: writer.write(out)
            self.assertIn('Cobalt', extract(root / 'forecast.pdf'))
            events = []
            with closing(Index(str(root / 'index.sqlite'), events.append)) as index:
                index._scan([str(root)])
                rows = index.search('Cobalt')
                self.assertEqual({r['kind'] for r in rows}, {'TXT', 'DOCX', 'PDF'})
                self.assertEqual(events[-1]['total'], 3)
                index._scan([str(root)])
                self.assertEqual(events[-1]['indexed'], 0)
                self.assertEqual(events[-1]['unchanged'], 3)
                (root / 'project.txt').unlink()
                index._scan([str(root)])
                self.assertEqual(index.status()['total'], 2)
                self.assertEqual(len(index.search('Cobalt')), 2)

if __name__ == '__main__': unittest.main()
