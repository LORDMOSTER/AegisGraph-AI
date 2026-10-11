login_path = r"c:\Users\hsri5\OneDrive\Desktop\AegisGraph-AI-main\frontend\src\pages\Login.tsx"

with open(login_path, "r", encoding="utf-8") as f:
    code = f.read()

# 1. Change default active tab to admin
code = code.replace(
    'const [activeTab, setActiveTab] = useState<LoginTab>("worker");',
    'const [activeTab, setActiveTab] = useState<LoginTab>("admin");'
)

# 2. Allow any password length for admin (like 1234)
code = code.replace(
    'const isPassValid = adminPass.length >= 6;',
    'const isPassValid = adminPass.length >= 1;'
)

# 3. Update validation error message
code = code.replace(
    'setError("Please check your email and password format.");',
    'setError("Please enter your admin email and password.");'
)

# 4. Remove "Password must be at least 6 characters" error message
code = code.replace(
    '''              {passTouched && !isPassValid && (
                <div style={{ fontSize: 12, color: "var(--red)", marginTop: 4 }}>
                  Password must be at least 6 characters.
                </div>
              )}''',
    '''              {passTouched && adminPass.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--red)", marginTop: 4 }}>
                  Password is required.
                </div>
              )}'''
)

# 5. Flip heading and subtitle defaults
code = code.replace(
    '{activeTab === "worker" ? "Operator Terminal" : "Compliance Control"}',
    '{activeTab === "admin" ? "Compliance Control" : "Operator Terminal"}'
)
code = code.replace(
    '''          {activeTab === "worker"
            ? "Enter your verified worker credentials to launch your proctored assessment."
            : "Sign in with administrator credentials to manage rules, exams, and audit logs."}''',
    '''          {activeTab === "admin"
            ? "Sign in with administrator credentials to manage rules, exams, and audit logs."
            : "Enter your verified worker credentials to launch your proctored assessment."}'''
)

# 6. Reorder tabs so Admin is on the LEFT, and Kiosk is on the RIGHT
old_tabs = '''      {/* ── Mode Switcher Tabs ── */}
      <div
        style={{
          background: "var(--raised)",
          borderRadius: 999,
          display: "inline-flex",
          padding: 4,
          marginBottom: 24,
          border: "1px solid var(--line)",
          width: "100%",
        }}
      >
        <button
          type="button"
          onClick={() => {
            setActiveTab("worker");
            setError(null);
            analytics.trackEvent("Auth", "Switch_Tab", "worker");
          }}
          style={{
            flex: 1,
            background: activeTab === "worker" ? "var(--surface)" : "transparent",
            color: activeTab === "worker" ? "var(--ink)" : "var(--muted)",
            boxShadow: activeTab === "worker" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
            border: "none",
            borderRadius: 999,
            padding: "9px 16px",
            fontSize: 13.5,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <iconify-icon icon="lucide:user-check" style={{ fontSize: 16 }} />
          Operator Kiosk
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("admin");
            setError(null);
            analytics.trackEvent("Auth", "Switch_Tab", "admin");
          }}
          style={{
            flex: 1,
            background: activeTab === "admin" ? "var(--surface)" : "transparent",
            color: activeTab === "admin" ? "var(--ink)" : "var(--muted)",
            boxShadow: activeTab === "admin" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
            border: "none",
            borderRadius: 999,
            padding: "9px 16px",
            fontSize: 13.5,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <iconify-icon icon="lucide:shield" style={{ fontSize: 16 }} />
          Administrator
        </button>
      </div>'''

new_tabs = '''      {/* ── Mode Switcher Tabs ── */}
      <div
        style={{
          background: "var(--raised)",
          borderRadius: 999,
          display: "inline-flex",
          padding: 4,
          marginBottom: 24,
          border: "1px solid var(--line)",
          width: "100%",
        }}
      >
        <button
          type="button"
          onClick={() => {
            setActiveTab("admin");
            setError(null);
            analytics.trackEvent("Auth", "Switch_Tab", "admin");
          }}
          style={{
            flex: 1,
            background: activeTab === "admin" ? "var(--surface)" : "transparent",
            color: activeTab === "admin" ? "var(--ink)" : "var(--muted)",
            boxShadow: activeTab === "admin" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
            border: "none",
            borderRadius: 999,
            padding: "9px 16px",
            fontSize: 13.5,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <iconify-icon icon="lucide:shield" style={{ fontSize: 16 }} />
          Administrator
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("worker");
            setError(null);
            analytics.trackEvent("Auth", "Switch_Tab", "worker");
          }}
          style={{
            flex: 1,
            background: activeTab === "worker" ? "var(--surface)" : "transparent",
            color: activeTab === "worker" ? "var(--ink)" : "var(--muted)",
            boxShadow: activeTab === "worker" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
            border: "none",
            borderRadius: 999,
            padding: "9px 16px",
            fontSize: 13.5,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <iconify-icon icon="lucide:user-check" style={{ fontSize: 16 }} />
          Operator Kiosk
        </button>
      </div>'''

code = code.replace(old_tabs, new_tabs)

with open(login_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(code)

print("Login.tsx updated: Admin at left, Kiosk at right, 4-digit passwords like 1234 allowed!")
