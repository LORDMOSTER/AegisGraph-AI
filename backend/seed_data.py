import asyncio
from app.db.session import async_session_factory
from app.models.company import Company
from app.models.user import User, RoleEnum
from app.core.security import hash_password
from app.api.v1.endpoints.users import create_employee, EmployeeCreate
import uuid
import re

from app.db.base_class import Base
from app.db.session import engine

def generate_company_code(name: str) -> str:
    words = name.upper().split()
    if len(words) > 1:
        code = "".join(w[0] for w in words)[:4]
    else:
        code = name.upper()[:4]
    return f"{code}-{str(uuid.uuid4())[:4]}"

async def seed_data():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    data = [
        {
            "company": {
                "name": "Meridian AutoComponents Pvt. Ltd.",
                "industry_type": "Automotive",
                "location": "Sriperumbudur, Tamil Nadu",
                "adminName": "Srihari P V",
                "adminEmail": "srihari@meridian.com",
                "adminPassword": "1234"
            },
            "employees": [
                { "name": "Arjun Balasubramanian", "department_name": "Machine Shop", "designation": "CNC Machine Operator" },
                { "name": "Priya Ramachandran", "department_name": "Machine Shop", "designation": "Quality Inspector" },
                { "name": "Vignesh Kumar", "department_name": "Material Handling", "designation": "Overhead Crane Operator" },
                { "name": "Karthik Subramaniam", "department_name": "Electrical & Maintenance", "designation": "Maintenance Technician (Electrical)" },
                { "name": "Divya Shankar", "department_name": "Machine Shop", "designation": "Shift Supervisor" },
                { "name": "Mohammed Rafiq", "department_name": "Material Handling", "designation": "Forklift Operator" }
            ]
        },
        {
            "company": {
                "name": "Girnar Mineral Resources Ltd.",
                "industry_type": "Mining",
                "location": "Ramgarh, Jharkhand",
                "adminName": "Mithra S",
                "adminEmail": "mithra@girnar.com",
                "adminPassword": "1234"
            },
            "employees": [
                { "name": "Suresh Mahato", "department_name": "Underground Operations", "designation": "Continuous Miner Operator" },
                { "name": "Biren Oraon", "department_name": "Haulage & Conveyance", "designation": "Conveyor Belt Attendant" },
                { "name": "Anita Kumari", "department_name": "Electrical & Ventilation", "designation": "Ventilation Technician" },
                { "name": "Ramesh Tudu", "department_name": "Underground Operations", "designation": "Underground Shift Foreman" },
                { "name": "Sanjay Hansda", "department_name": "Electrical & Ventilation", "designation": "Electrician (Underground)" },
                { "name": "Pooja Devi", "department_name": "Underground Operations", "designation": "Safety Officer" }
            ]
        },
        {
            "company": {
                "name": "Konark Heavy Engineering Works",
                "industry_type": "Heavy Manufacturing",
                "location": "Rourkela, Odisha",
                "adminName": "Sabarish M",
                "adminEmail": "sabarish@konark.com",
                "adminPassword": "1234"
            },
            "employees": [
                { "name": "Debasish Patra", "department_name": "Machine Shop", "designation": "CNC Lathe Operator" },
                { "name": "Bikash Nayak", "department_name": "Machine Shop", "designation": "Bench Lathe Machinist" },
                { "name": "Rajesh Behera", "department_name": "Fabrication", "designation": "Fabrication Technician" },
                { "name": "Sunita Pradhan", "department_name": "Logistics", "designation": "Forklift Operator" },
                { "name": "Manoj Sahoo", "department_name": "Fabrication", "designation": "Plant Supervisor" },
                { "name": "Ashok Mohanty", "department_name": "Logistics", "designation": "Material Handler" }
            ]
        }
    ]

    async with async_session_factory() as db:
        for c_data in data:
            c = c_data["company"]
            code = generate_company_code(c["name"])
            print(f"Seeding Company: {c['name']} ({code})")
            
            new_company = Company(
                company_code=code,
                name=c["name"],
            )
            db.add(new_company)
            await db.flush()
            
            admin_user = User(
                company_id=new_company.id,
                employee_code=c["adminEmail"],
                full_name=c["adminName"],
                password_hash=hash_password(c["adminPassword"]),
                role=RoleEnum.SUPER_ADMIN
            )
            db.add(admin_user)
            await db.commit()
            
            for emp in c_data["employees"]:
                print(f"  - Creating employee: {emp['name']} in {emp['department_name']}")
                e_in = EmployeeCreate(
                    name=emp["name"],
                    departmentCode="", # Will be derived
                    departmentName=emp["department_name"],
                    designation=emp["designation"]
                )
                res = await create_employee(emp_in=e_in, db=db, current_user=admin_user)
                print(f"    -> Generated ID: {res.id}, Code: {res.departmentCode}")
            print("---")

if __name__ == "__main__":
    asyncio.run(seed_data())
