import React, { useState, useEffect } from "react";
import { ThemeToggle } from "../components/ThemeToggle";

interface SettingsProps {
  darkMode: boolean;
  onToggleDark: () => void;
}

export function Settings({ darkMode, onToggleDark }: SettingsProps) {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // New fields
  const [companyName, setCompanyName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [retentionDays, setRetentionDays] = useState(localStorage.getItem("aegis_clip_retention_days") || "30");

  useEffect(() => {
    const fetchCompanyInfo = async () => {
      const token = localStorage.getItem("aegis_token");
      if (token) {
        try {
          const res = await fetch("http://localhost:8000/api/v1/auth/me", {
            headers: { "Authorization": `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setCompanyId(data.company_id);
            setCompanyName(data.company_name || "");
            setAdminEmail(data.email || data.employee_code || "");
            if (data.company) {
               setLogoUrl(data.company.logo_url);
            }
          }
        } catch (err) {
          console.error("Failed to fetch company info", err);
        }
      }
    };
    fetchCompanyInfo();
  }, []);

  const handleUpdateProfile = async () => {
    if (!companyId) return;
    try {
      const token = localStorage.getItem("aegis_token");
      const res = await fetch(`http://localhost:8000/api/v1/companies/${companyId}/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          company_name: companyName,
          admin_email: adminEmail,
          admin_password: adminPassword || null
        })
      });

      if (res.ok) {
        localStorage.setItem("aegis_clip_retention_days", retentionDays);
        alert("Profile and settings updated successfully!");
        setAdminPassword(""); // Clear the password field after successful update
      } else {
        const errorData = await res.json();
        alert(`Failed to update profile: ${errorData.detail || "Unknown error"}`);
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred while updating the profile.");
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: 600, display: "flex", flexDirection: "column", gap: 32 }}>
        
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em", marginBottom: 8 }}>
            Settings
          </h1>
          <p style={{ fontSize: 14, color: "var(--muted)" }}>
            Manage your company profile and system appearance.
          </p>
        </div>

        {/* Company Profile Section */}
        <div className="card" style={{ padding: 32, display: "flex", flexDirection: "column", gap: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>Company Profile</h2>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>Company Name</label>
            <input 
              type="text" 
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="input-field" 
              style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>Company Logo</label>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {logoUrl ? (
                <a 
                  href={`http://localhost:8000${logoUrl}`} 
                  target="_blank" 
                  rel="noreferrer"
                  title="Click to view full image"
                  style={{ width: 64, height: 64, borderRadius: 8, border: "1px solid var(--line)", overflow: "hidden", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer", textDecoration: "none" }}
                >
                  <img src={`http://localhost:8000${logoUrl}`} alt="Company Logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                </a>
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: 8, background: "var(--raised)", border: "1px dashed var(--line)", display: "grid", placeItems: "center", color: "var(--muted)" }}>
                  <iconify-icon icon="lucide:image" style={{ fontSize: 24 }} />
                </div>
              )}
              
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input 
                  type="file" 
                  accept="image/*" 
                  id="logoUpload"
                  style={{ display: "none" }}
                  disabled={isUploading}
                  onChange={async (e) => {
                    if (!e.target.files?.[0]) return;
                    if (!companyId) return;
                    setIsUploading(true);
                    const formData = new FormData();
                    formData.append("file", e.target.files[0]);
                    
                    try {
                      const res = await fetch(`http://localhost:8000/api/v1/companies/${companyId}/logo`, {
                        method: "POST",
                        body: formData,
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setLogoUrl(data.logo_url);
                      }
                    } finally {
                      setIsUploading(false);
                    }
                  }}
                />
                <button 
                  disabled={isUploading} 
                  onClick={() => document.getElementById("logoUpload")?.click()} 
                  className="btn btn-primary" 
                  style={{ padding: "8px 16px", fontSize: 13 }}
                >
                  {isUploading ? "Uploading..." : logoUrl ? "Change Logo" : "Upload Logo"}
                </button>
                {logoUrl && (
                  <button 
                    disabled={isUploading}
                    onClick={async () => {
                      if (!companyId) return;
                      setIsUploading(true);
                      try {
                        const res = await fetch(`http://localhost:8000/api/v1/companies/${companyId}/logo`, { method: "DELETE" });
                        if (res.ok) setLogoUrl(null);
                      } finally {
                        setIsUploading(false);
                      }
                    }} 
                    className="btn btn-destructive" 
                    style={{ padding: "6px 16px", fontSize: 13, background: "transparent", color: "var(--red)", border: "none", alignSelf: "flex-start" }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Admin Credentials Section */}
        <div className="card" style={{ padding: 32, display: "flex", flexDirection: "column", gap: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>Admin Credentials</h2>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>Admin Email</label>
            <input 
              type="email" 
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              className="input-field" 
              style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>New Password</label>
            <input 
              type="password" 
              placeholder="Leave blank to keep current"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              className="input-field" 
              style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)" }}
            />
          </div>
        </div>

        {/* Data & Storage Section */}
        <div className="card" style={{ padding: 32, display: "flex", flexDirection: "column", gap: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>Data & Storage</h2>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>Local Video Clip Retention (Days)</label>
            <input 
              type="number" 
              min="1"
              max="365"
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
              className="input-field" 
              style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)" }}
            />
            <p style={{ fontSize: 12, color: "var(--muted)" }}>
              Anomaly video clips are stored locally in the browser (IndexedDB). They will be automatically deleted after this many days.
            </p>
          </div>
        </div>

        <button 
          onClick={handleUpdateProfile} 
          className="btn btn-primary" 
          style={{ padding: "12px 24px", fontSize: 15, fontWeight: 600, width: "100%", justifyContent: "center", borderRadius: 10 }}
        >
          Save Changes
        </button>

        {/* Appearance Section */}
        <div className="card" style={{ padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>Appearance</h2>
            <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>Toggle between light and dark themes.</p>
          </div>
          <ThemeToggle darkMode={darkMode} onToggleDark={onToggleDark} />
        </div>

      </div>
    </div>
  );
}
