import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const fileInput = document.getElementById('pdfFile');
const countBtn = document.getElementById('countBtn');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');
const statusEl = document.getElementById('status');
const fileInfo = document.getElementById('fileInfo');
const resultArea = document.getElementById('resultArea');
const resultBody = document.getElementById('resultBody');
const plainResult = document.getElementById('plainResult');
const totalLabelsEl = document.getElementById('totalLabels');
const totalSkusEl = document.getElementById('totalSkus');

let selectedFile = null;
let lastCounts = {};

fileInput.addEventListener('change', () => {
  selectedFile = fileInput.files[0] || null;
  countBtn.disabled = !selectedFile;
  copyBtn.disabled = true;
  downloadBtn.disabled = true;
  resultArea.classList.add('hidden');

  if (selectedFile) {
    fileInfo.textContent = `Selected: ${selectedFile.name}`;
    fileInfo.classList.remove('hidden');
  }
});

function cleanSKU(s) {
  return s.replace(/\s+/g, ' ').replace(/^[:\-–—]+|[:\-–—]+$/g, '').trim();
}

// Meesho label format:
// Product Details
// SKU Size Qty Color Order No.
// <SKU text> <SIZE> <QTY> <COLOR> <ORDER_NO>
function extractSKU(text) {
  const normalized = text.replace(/\r/g, '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

  const start = normalized.search(/Product Details\s+SKU\s+Size\s+Qty\s+Color\s+Order No\.?/i);
  if (start === -1) return null;

  const afterHeader = normalized
    .slice(start)
    .replace(/^.*?Product Details\s+SKU\s+Size\s+Qty\s+Color\s+Order No\.?\s*/i, '');

  // SKU can contain spaces/commas. Size is one of common apparel sizes, followed by quantity.
  const match = afterHeader.match(/^(.*?)\s+(XXS|XS|S|M|L|XL|XXL|XXXL|4XL|5XL)\s+(\d+)\s+/i);
  return match ? cleanSKU(match[1]) : null;
}

async function pageText(page) {
  const content = await page.getTextContent();
  return content.items.map(item => item.str).join(' ');
}

countBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  try {
    countBtn.disabled = true;
    statusEl.textContent = 'PDF scan ho rahi hai...';
    const data = new Uint8Array(await selectedFile.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const counts = {};
    const notFound = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      statusEl.textContent = `Page ${i} / ${pdf.numPages} scan ho raha hai...`;
      const page = await pdf.getPage(i);
      const text = await pageText(page);
      const sku = extractSKU(text);

      if (sku) counts[sku] = (counts[sku] || 0) + 1;
      else notFound.push(i);
    }

    lastCounts = counts;
    renderResults(counts, pdf.numPages, notFound);
    copyBtn.disabled = Object.keys(counts).length === 0;
    downloadBtn.disabled = Object.keys(counts).length === 0;
    statusEl.textContent = notFound.length
      ? `Done. ${notFound.length} page(s) ka SKU auto-detect nahi hua: ${notFound.join(', ')}`
      : 'Done! Saare labels successfully count ho gaye.';
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'PDF read nahi ho paayi. Please Meesho ki text-based label PDF try karo.';
  } finally {
    countBtn.disabled = false;
  }
});

function renderResults(counts, totalPages, notFound) {
  const entries = Object.entries(counts).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
  resultBody.innerHTML = '';
  const lines = entries.map(([sku, qty]) => `${sku} = ${qty}`);

  for (const [sku, qty] of entries) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(sku)}</td><td>${qty}</td>`;
    resultBody.appendChild(tr);
  }

  plainResult.textContent = lines.join('\n');
  totalLabelsEl.textContent = entries.reduce((sum, [,qty]) => sum + qty, 0);
  totalSkusEl.textContent = entries.length;
  resultArea.classList.remove('hidden');
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

copyBtn.addEventListener('click', async () => {
  const text = plainResult.textContent;
  await navigator.clipboard.writeText(text);
  copyBtn.textContent = 'Copied!';
  setTimeout(() => copyBtn.textContent = 'Copy Result', 1500);
});

downloadBtn.addEventListener('click', () => {
  const csv = 'SKU ID,Total Labels\n' + Object.entries(lastCounts)
    .sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]))
    .map(([sku,qty]) => `"${sku.replace(/"/g,'""')}",${qty}`).join('\n');

  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'meesho-sku-label-count.csv';
  a.click();
  URL.revokeObjectURL(url);
});
