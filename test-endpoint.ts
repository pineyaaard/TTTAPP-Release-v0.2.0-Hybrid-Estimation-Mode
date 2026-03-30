import fetch from "node-fetch";

async function test() {
  const base64Image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  try {
    const res = await fetch('http://localhost:3000/api/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: [{ data: base64Image, mimeType: 'image/png' }],
        vin: '12345678901234567'
      })
    });
    const data = await res.json();
    console.log("Response:", data);
  } catch (e) {
    console.error("Error:", e);
  }
}

test();
