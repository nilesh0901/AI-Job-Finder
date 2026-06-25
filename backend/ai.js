import { GoogleGenerativeAI } from '@google/generative-ai';

let genAI;

function getModel() {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY is not set. Open backend/.env and add your key from aistudio.google.com');
  }
  if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
}

export async function testConnection() {
  const model = getModel();
  const result = await model.generateContent('Reply with the single word: ok');
  const text = result.response.text().trim().toLowerCase();
  if (!text.includes('ok')) throw new Error('Unexpected response from Gemini');
  return true;
}

export async function generateAIContent({ title, company, jobDescription, masterResume }) {
  const model = getModel();

  const prompt = `You are a professional career coach and resume writer. Analyze the job posting and candidate resume below.
Return ONLY a valid JSON object with exactly these 4 keys: "coverLetter", "resumeBullets", "interviewQuestions", "companyBrief".
No markdown code fences. No text before or after the JSON.

## JOB POSTING
Title: ${title || 'Not specified'}
Company: ${company || 'Not specified'}
Description:
${jobDescription || 'Not provided'}

## CANDIDATE MASTER RESUME
${masterResume || 'No resume provided — generate best-effort content based on the job posting alone.'}

## OUTPUT INSTRUCTIONS

"coverLetter": Write a tailored, professional cover letter with 3 paragraphs:
  1. Opening hook that connects the candidate's background to the role
  2. Evidence paragraph matching the resume to 2-3 specific job requirements
  3. Closing CTA requesting an interview
  Address it to "Hiring Team". Do not use placeholder brackets like [Your Name].

"resumeBullets": Rewrite 5-7 resume bullets from the candidate's resume to better match this job's keywords and requirements. Use STAR format (Situation/Task → Action → Result). Return as a numbered list. Each bullet starts with a strong action verb.

"interviewQuestions": List exactly 5 likely interview questions for this specific role at this company. After each question, add "Strategy: " followed by a 2-sentence answer strategy. Format strictly as:
Q1: [question]
Strategy: [2-sentence strategy]
Q2: ...

"companyBrief": Write a 300-400 word company brief covering:
  - What the company does and their business model
  - Their known products, customers, or market position
  - Recent news or challenges (if known, otherwise omit)
  - Why a candidate would want to work there
  - Two smart questions to ask the interviewer

Return ONLY valid JSON. Example structure:
{"coverLetter": "...", "resumeBullets": "...", "interviewQuestions": "...", "companyBrief": "..."}`;

  const result = await model.generateContent(prompt);
  let text = result.response.text().trim();

  // Strip markdown fences if present
  text = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();

  try {
    return JSON.parse(text);
  } catch {
    // Second attempt — find the first { to last } substring
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error('AI returned malformed JSON. Please try again.');
  }
}
