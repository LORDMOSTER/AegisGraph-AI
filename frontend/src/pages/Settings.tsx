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
      <div style={{ width: "100%", maxWidth: 800, display: "flex", flexDirection: "column", gap: 24 }}>
        
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.01em", marginBottom: 4 }}>
            Settings
          </h1>
          <p style={{ fontSize: 14, color: "var(--muted)" }}>
            Manage your company profile, security, and preferences.
          </p>
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden", borderRadius: 12 }}>
          
          {/* Company Profile Section */}
          <div style={{ padding: "32px", borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>Company Profile</h2>
              <p style={{ fontSize: 13, color: "var(--muted)" }}>Update your company's name and logo.</p>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>Company Name</label>
                <input 
                  type="text" 
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="input-field" 
                  style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--background)", color: "var(--ink)" }}
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
                      style={{ width: 48, height: 48, borderRadius: 8, border: "1px solid var(--line)", overflow: "hidden", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer", textDecoration: "none", flexShrink: 0 }}
                    >
                      <img src={`http://localhost:8000${logoUrl}`} alt="Company Logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                    </a>
                  ) : (
                    <div style={{ width: 48, height: 48, borderRadius: 8, background: "var(--raised)", border: "1px dashed var(--line)", display: "grid", placeItems: "center", color: "var(--muted)", flexShrink: 0 }}>
                      <iconify-icon icon="lucide:image" style={{ fontSize: 20 }} />
                    </div>
                  )}
                  
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
                      className="btn btn-outline" 
                      style={{ padding: "8px 12px", fontSize: 13 }}
                    >
                      {isUploading ? "Uploading..." : "Upload Logo"}
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
                        className="btn btn-ghost" 
                        style={{ padding: "8px 12px", fontSize: 13, color: "var(--red)" }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Admin Credentials Section */}
          <div style={{ padding: "32px", borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>Security & Authentication</h2>
              <p style={{ fontSize: 13, color: "var(--muted)" }}>Manage your admin credentials for accessing the platform.</p>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>Admin Email</label>
                <input 
                  type="email" 
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className="input-field" 
                  style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--background)", color: "var(--ink)" }}
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
                  style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--background)", color: "var(--ink)" }}
                />
              </div>
            </div>
          </div>

          {/* Data & Storage Section */}
          <div style={{ padding: "32px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 32 }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>Data Retention</h2>
              <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
                Configure how long anomaly video clips are stored locally in the browser before being automatically deleted.
              </p>
            </div>
            <div style={{ width: 140 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--background)", border: "1px solid var(--line)", borderRadius: 8, padding: "4px 8px" }}>
                <input 
                  type="number" 
                  min="1"
                  max="365"
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(e.target.value)}
                  style={{ width: "100%", border: "none", background: "transparent", color: "var(--ink)", padding: "6px", outline: "none", fontSize: 14, textAlign: "right" }}
                />
                <span style={{ fontSize: 13, color: "var(--muted)", paddingRight: 4 }}>Days</span>
              </div>
            </div>
          </div>

          {/* Appearance Section */}
          <div style={{ padding: "32px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.01)" }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>Appearance</h2>
              <p style={{ fontSize: 13, color: "var(--muted)" }}>Toggle between light and dark themes.</p>
            </div>
            <ThemeToggle darkMode={darkMode} onToggleDark={onToggleDark} />
          </div>

        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button 
            onClick={handleUpdateProfile} 
            className="btn btn-primary" 
            style={{ padding: "10px 24px", fontSize: 14, fontWeight: 600, borderRadius: 8 }}
          >
            Save Changes
          </button>
        </div>

      </div>
    </div>
  );
}
