import os
import uuid
import json
import base64
from datetime import datetime
from nacl.signing import SigningKey
from nacl.encoding import HexEncoder
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
import qrcode
import tempfile

CERT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "static", "certificates")
os.makedirs(CERT_DIR, exist_ok=True)

# Fixed key for demo purposes. In production, load from secure vault or env.
SECRET_KEY_BYTES = b"thisisasecretkeyfornacl123456789"

def generate_certificate(exam_session_id: uuid.UUID, employee_id: uuid.UUID, full_name: str, score: float, company_name: str) -> tuple[str, str, str]:
    # 1. Ed25519 Signing
    signing_key = SigningKey(SECRET_KEY_BYTES)
    
    payload = {
        "exam_session_id": str(exam_session_id),
        "employee_id": str(employee_id),
        "name": full_name,
        "score": score,
        "issued_at": datetime.utcnow().isoformat()
    }
    payload_bytes = json.dumps(payload, sort_keys=True).encode("utf-8")
    signed = signing_key.sign(payload_bytes, encoder=HexEncoder)
    signed_payload_hex = signed.signature.decode("utf-8")
    
    # 2. QR Code
    qr_data = json.dumps({
        "exam_session_id": str(exam_session_id),
        "signature": signed_payload_hex
    })
    
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(qr_data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tf:
        img.save(tf.name)
        qr_path = tf.name

    # 3. PDF Generation
    cert_filename = f"cert_{exam_session_id}.pdf"
    cert_path = os.path.join(CERT_DIR, cert_filename)
    
    c = canvas.Canvas(cert_path, pagesize=letter)
    width, height = letter
    
    c.setFont("Helvetica-Bold", 36)
    c.drawCentredString(width / 2.0, height - 150, "Certificate of Safety Compliance")
    
    c.setFont("Helvetica", 18)
    c.drawCentredString(width / 2.0, height - 250, "This certifies that")
    
    c.setFont("Helvetica-Bold", 28)
    c.drawCentredString(width / 2.0, height - 320, full_name or "Employee")
    
    c.setFont("Helvetica", 16)
    c.drawCentredString(width / 2.0, height - 390, f"has successfully completed the {company_name} Safety Assessment")
    c.drawCentredString(width / 2.0, height - 430, f"with a Safety Compliance Index (SCI) of {score:.1f}%")
    
    # Draw QR Code
    c.drawImage(qr_path, width / 2.0 - 75, height - 650, width=150, height=150)
    
    c.setFont("Helvetica", 10)
    c.drawCentredString(width / 2.0, height - 680, f"Session ID: {str(exam_session_id)}")
    c.drawCentredString(width / 2.0, height - 700, f"Issued: {payload['issued_at']}")
    
    c.save()
    
    os.unlink(qr_path)
    
    pdf_url = f"/static/certificates/{cert_filename}"
    return qr_data, signed_payload_hex, pdf_url
