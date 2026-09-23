from fastapi import APIRouter
from app.api.v1.endpoints import hierarchy, auth, users, companies, certificates

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(companies.router, prefix="/companies", tags=["companies"])
api_router.include_router(hierarchy.router, prefix="/hierarchy", tags=["Hierarchy"])
api_router.include_router(certificates.router, prefix="/certificates", tags=["Certificates"])
