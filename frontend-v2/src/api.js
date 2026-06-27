/**
 * api.js — All data operations for AI Job Finder v2
 * CRUD → Supabase directly (supabase-js)
 * AI / scrape / PDF → FastAPI backend (/api/*)
 */

import { supabase } from './lib/supabase'

const API = import.meta.env.VITE_API_BASE_URL || '/api'

// ── Jobs CRUD ─────────────────────────────────────────────────────────────────

export async function getJobs() {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .order('added_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createJob(fields) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('jobs')
    .insert({ ...fields, user_id: user.id, status: fields.status || 'wishlist' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateJob(id, fields) {
  const { data, error } = await supabase
    .from('jobs')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteJob(id) {
  const { error } = await supabase.from('jobs').delete().eq('id', id)
  if (error) throw error
}

// ── Master Resume ─────────────────────────────────────────────────────────────

export async function getMasterResume() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data } = await supabase
    .from('master_resumes')
    .select('content')
    .eq('user_id', user.id)
    .single()
  return data?.content || ''
}

export async function saveMasterResume(content) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('master_resumes')
    .upsert({ user_id: user.id, content, updated_at: new Date().toISOString() })
  if (error) throw error
}

// ── User Profile ──────────────────────────────────────────────────────────────

export async function getUserProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()
  return data
}

export async function saveUserProfile(profile) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('user_profiles')
    .upsert({ ...profile, user_id: user.id, updated_at: new Date().toISOString() })
  if (error) throw error
}

// ── ATS Resumes ───────────────────────────────────────────────────────────────

export async function getATSResumes(jobId) {
  const { data, error } = await supabase
    .from('ats_resumes')
    .select('*')
    .eq('job_id', jobId)
    .order('version', { ascending: false })
  if (error) throw error
  return data
}

export async function saveATSResume(jobId, content, pdfUrl = null) {
  const { data: { user } } = await supabase.auth.getUser()
  // get next version number
  const { data: existing } = await supabase
    .from('ats_resumes')
    .select('version')
    .eq('job_id', jobId)
    .order('version', { ascending: false })
    .limit(1)

  const nextVersion = existing?.length ? existing[0].version + 1 : 1

  const { data, error } = await supabase
    .from('ats_resumes')
    .insert({ user_id: user.id, job_id: jobId, content, pdf_url: pdfUrl, version: nextVersion })
    .select()
    .single()
  if (error) throw error
  return data
}

// ── FastAPI calls ─────────────────────────────────────────────────────────────

export async function scrapeJob(url) {
  const r = await fetch(`${API}/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  // Even when the backend deliberately returns { success: false, error: "..." } it uses HTTP 200.
  // A non-2xx here means the route itself is unreachable (CORS, 404, 500, Railway down).
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    throw new Error(`Scrape request failed (${r.status}): ${text.slice(0, 200) || 'no response body'}`)
  }
  return r.json()
}

export async function generateAIContent({ title, company, jobDescription, masterResume, userProfile }) {
  const r = await fetch(`${API}/ai/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, company, jobDescription, masterResume, userProfile }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function generateATSResume({ jobDescription, masterResume, userProfile }) {
  const r = await fetch(`${API}/ai/ats-resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobDescription, masterResume, userProfile }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function generateResumePDF({ resumeText, jobId, userId }) {
  const r = await fetch(`${API}/resume/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeText, jobId, userId }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}
