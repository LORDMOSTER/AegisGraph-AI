import os
import uuid
import json
import base64
from datetime import datetime
from nacl.signing import SigningKey
from nacl.encoding import HexEncoder
from reportlab.lib.pagesizes import letter, landscape
from reportlab.pdfgen import canvas
import qrcode
import tempfile

CERT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "static", "certificates")
os.makedirs(CERT_DIR, exist_ok=True)

# Fixed key for demo purposes. In production, load from secure vault or env.
SECRET_KEY_BYTES = b"thisisasecretkeyfornacl123456789"

def generate_certificate(certificate_id: uuid.UUID, employee_id: uuid.UUID, full_name: str, score: float, company_name: str, is_imported: bool = False, original_issuer: str = None, original_issue_date: str = None, cert_number: str = None, assessment_name: str = "Safety Assessment", logo_url: str = None, designation: str = None) -> tuple[str, str, str]:
    # 1. Ed25519 Signing
    signing_key = SigningKey(SECRET_KEY_BYTES)
    
    payload = {
        "certificate_id": str(certificate_id),
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
    import urllib.parse
    # For a fully offline local network app, the phone must be on the same WiFi
    base_url = "http://localhost:5173" # Update to LAN IP for physical device testing
    qr_data = f"{base_url}/verify/{certificate_id}?sig={signed_payload_hex}"
    
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(qr_data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tf:
        img.save(tf.name)
        qr_path = tf.name

    # 3. PDF Generation
    cert_filename = f"cert_{certificate_id}.pdf"
    cert_path = os.path.join(CERT_DIR, cert_filename)
    
    # Use landscape orientation
    c = canvas.Canvas(cert_path, pagesize=landscape(letter))
    width, height = landscape(letter)
    
    # Outer Border
    c.setStrokeColorRGB(0.1, 0.2, 0.4)
    c.setLineWidth(10)
    c.rect(20, 20, width - 40, height - 40)
    
    # Inner Border
    c.setStrokeColorRGB(0.8, 0.7, 0.2)
    c.setLineWidth(2)
    c.rect(30, 30, width - 60, height - 60)
    
    if is_imported:
        c.setFont("Helvetica-Bold", 32)
        c.drawCentredString(width / 2.0, height - 120, "Imported Certificate Record")
        
        c.setFont("Helvetica", 16)
        c.drawCentredString(width / 2.0, height - 180, "This document serves as a verified imported record for")
        
        c.setFont("Helvetica-Bold", 28)
        c.drawCentredString(width / 2.0, height - 230, full_name or "Employee")
        
        if designation:
            c.setFont("Helvetica-Oblique", 14)
            c.drawCentredString(width / 2.0, height - 250, designation)
        
        c.setFont("Helvetica", 14)
        issuer_text = original_issuer or "an external provider"
        date_text = original_issue_date or "an unknown date"
        c.drawCentredString(width / 2.0, height - 280, f"Imported record - originally issued by {issuer_text} on {date_text}")
        if score:
            c.drawCentredString(width / 2.0, height - 310, f"Recorded Score: {score}")
            
        c.setFont("Helvetica-Oblique", 10)
        c.drawCentredString(width / 2.0, height - 360, "Note: AegisGraph has not examined the holder. This is a digital twin of an external certificate.")
    else:
        c.setFillColorRGB(0.1, 0.2, 0.4)
        c.setFont("Helvetica-Bold", 36)
        c.drawCentredString(width / 2.0, height - 120, "Certificate of Safety Compliance")
        
        c.setFillColorRGB(0, 0, 0)
        
        c.setFont("Helvetica", 18)
        c.drawCentredString(width / 2.0, height - 180, "This certifies that")
        
        c.setFont("Helvetica-Bold", 28)
        c.drawCentredString(width / 2.0, height - 230, full_name or "Employee")
        
        if designation:
            c.setFont("Helvetica-Oblique", 14)
            c.drawCentredString(width / 2.0, height - 250, designation)
        
        c.setFont("Helvetica", 16)
        c.drawCentredString(width / 2.0, height - 280, "has successfully completed the certification requirements for:")
        
        c.setFont("Helvetica-Bold", 24)
        c.drawCentredString(width / 2.0, height - 320, f"{assessment_name}")
        
        c.setFont("Helvetica", 16)
        c.drawCentredString(width / 2.0, height - 370, f"Authorized by {company_name}")
        
        c.setFont("Helvetica", 14)
        c.drawCentredString(width / 2.0, height - 400, f"Safety Compliance Index (SCI): {score:.1f}%")
    
    # Draw Logo if exists
    if logo_url:
        try:
            # Assuming logo_url starts with /static/logos/...
            logo_path = os.path.join(os.getcwd(), logo_url.lstrip('/'))
            if os.path.exists(logo_path):
                # Position it with padding inside the inner border (x=30, top=height-30)
                c.drawImage(logo_path, 50, height - 100, width=100, height=50, preserveAspectRatio=True)
        except Exception:
            pass

    # Draw QR Code (bottom center)
    qr_size = 100
    qr_y = height - 530
    c.drawImage(qr_path, width / 2.0 - (qr_size / 2.0), qr_y, width=qr_size, height=qr_size)
    
    issued_date_obj = datetime.fromisoformat(payload['issued_at'])
    formatted_date = issued_date_obj.strftime("%d/%m/%Y")
    
    c.setFont("Helvetica", 10)
    c.setFillColorRGB(0.4, 0.4, 0.4)
    # Text below the QR code
    c.drawCentredString(width / 2.0, qr_y - 15, f"Credential ID: {str(certificate_id)}")
    c.drawCentredString(width / 2.0, qr_y - 30, f"Issued on: {formatted_date}")
    if is_imported and cert_number:
        c.drawCentredString(width / 2.0, qr_y - 45, f"Original Cert No: {cert_number}")
    
    c.save()
    
    os.unlink(qr_path)
    
    pdf_url = f"/static/certificates/{cert_filename}"
    return qr_data, signed_payload_hex, pdf_url
