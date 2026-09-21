from pydantic import BaseModel, EmailStr

class CompanyRegister(BaseModel):
    companyName: str
    industryType: str
    address: str
    adminName: str
    adminEmail: EmailStr
    adminPassword: str

class CompanyResponse(BaseModel):
    companyCode: str
