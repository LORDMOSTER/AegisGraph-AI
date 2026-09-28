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

def generate_certificate(exam_session_id: uuid.UUID, employee_id: uuid.UUID, full_name: str, score: float, company_name: str, is_imported: bool = False, original_issuer: str = None, original_issue_date: str = None, cert_number: str = None) -> tuple[str, str, str]:
    # 1. Ed25519 Signing
    signing_key = SigningKey(SECRET_KEY_BYTES)
    
    payload = {
        "exam_session_id": str(exam_session_id),
        "employee_id": str(employee_id),
        "name": full_name,
        "score": score,
        "issued_at": datetime.utcnow().isoformat()
    }
    
    if is_imported:
        payload["type"] = "imported"
        if cert_number:
            payload["original_certificate_number"] = cert_number
            
    payload_bytes = json.dumps(payload, sort_keys=True).encode("utf-8")
    signed = signing_key.sign(payload_bytes, encoder=HexEncoder)
    signed_payload_hex = signed.signature.decode("utf-8")
    
    # 2. QR Code
    qr_data = json.dumps({
        "exam_session_id": str(exam_session_id),
        "signature": signed_payload_hex,
        "is_imported": is_imported
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
    
    if is_imported:
        c.setFont("Helvetica-Bold", 32)
        c.drawCentredString(width / 2.0, height - 150, "Imported Certificate Record")
        
        c.setFont("Helvetica", 16)
        c.drawCentredString(width / 2.0, height - 230, "This document serves as a verified imported record for")
        
        c.setFont("Helvetica-Bold", 28)
        c.drawCentredString(width / 2.0, height - 300, full_name or "Employee")
        
        c.setFont("Helvetica", 14)
        issuer_text = original_issuer or "an external provider"
        date_text = original_issue_date or "an unknown date"
        c.drawCentredString(width / 2.0, height - 380, f"Imported record - originally issued by {issuer_text} on {date_text}")
        if score:
            c.drawCentredString(width / 2.0, height - 420, f"Recorded Score: {score}")
            
        c.setFont("Helvetica-Oblique", 10)
        c.drawCentredString(width / 2.0, height - 500, "Note: AegisGraph has not examined the holder. This is a digital twin of an external certificate.")
    else:
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
    if is_imported and cert_number:
        c.drawCentredString(width / 2.0, height - 720, f"Original Cert No: {cert_number}")
    
    c.save()
    
    os.unlink(qr_path)
    
    pdf_url = f"/static/certificates/{cert_filename}"
    return qr_data, signed_payload_hex, pdf_url
