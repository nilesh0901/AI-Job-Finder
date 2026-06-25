import { useState } from 'react';
import { testAI } from '../api';

export default function Settings() {
  const [resume, setResume] = useState(localStorage.getItem('masterResume') || '');
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  function saveResume() {
    localStorage.setItem('masterResume', resume);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testAI();
      setTestResult(res.ok ? { ok: true } : { ok: false, msg: res.error });
    } catch (e) {
      setTestResult({ ok: false, msg: e.message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-title">Settings</div>

      {/* Master Resume */}
      <div className="settings-section">
        <div className="settings-section-title">Your Master Resume</div>
        <div className="settings-section-desc">
          Paste the full text of your resume here. The AI will use this as the base and
          customize it for each job you apply to. Saved locally in your browser.
        </div>
        <textarea
          className="form-textarea"
          style={{ minHeight: 260 }}
          placeholder="Paste your resume text here…

Example:
NILESH K.
nilesh@email.com | LinkedIn | Portfolio

EXPERIENCE
Senior Product Manager, Acme Corp (2021–Present)
- Led cross-functional team of 8 to deliver..."
          value={resume}
          onChange={(e) => setResume(e.target.value)}
        />
        <div className="char-count">{resume.length.toLocaleString()} characters</div>
        <div style={{ marginTop: 'var(--sp-md)', display: 'flex', gap: 'var(--sp-xs)', alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={saveResume}>
            {saved ? '✓ Saved!' : 'Save Resume'}
          </button>
          {!resume.trim() && (
            <span style={{ fontSize: 13, color: 'var(--ink-tertiary)' }}>
              AI generation won't work until you save a resume
            </span>
          )}
        </div>
      </div>

      {/* Gemini API Key */}
      <div className="settings-section">
        <div className="settings-section-title">Gemini AI Setup</div>
        <div className="settings-section-desc">
          The AI features use Google Gemini Flash (free). Follow these steps once to set it up:
        </div>
        <ol className="api-steps">
          <li>
            Go to <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com</a> and sign in with your Google account.
          </li>
          <li>
            Click <strong style={{ color: 'var(--ink)' }}>Create API Key</strong>. Copy the key.
          </li>
          <li>
            Open the file <code className="code-inline">backend/.env</code> in the project folder with any text editor.
          </li>
          <li>
            Replace <code className="code-inline">your_gemini_api_key_here</code> with your key:
            <br />
            <code className="code-inline" style={{ marginTop: 4, display: 'inline-block' }}>GEMINI_API_KEY=AIza…your_key…</code>
          </li>
          <li>
            Restart the backend (press <code className="code-inline">Ctrl+C</code> in the terminal, then <code className="code-inline">npm run dev</code> again).
          </li>
        </ol>
        <button className="btn btn-secondary" onClick={handleTest} disabled={testing}>
          {testing ? <><span className="spinner" /> Testing…</> : 'Test Connection'}
        </button>
        {testResult && (
          <div className={`test-result ${testResult.ok ? 'ok' : 'fail'}`}>
            {testResult.ok
              ? '✓ Connected! Gemini is ready to use.'
              : `✗ ${testResult.msg || 'Connection failed. Check your API key and restart the backend.'}`}
          </div>
        )}
      </div>
    </div>
  );
}
