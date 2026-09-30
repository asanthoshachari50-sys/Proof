'use strict';
const $ = selector => document.querySelector(selector);
const token = localStorage.getItem('proof-token');
const questions = [
  'What problem did this project solve, and who did you build it for?',
  'Describe one design or technical decision you made and the trade-off behind it.',
  'Tell us about a bug or obstacle you encountered. How did you investigate and fix it?',
  'If you had another week, what would you improve first — and why?'
];
const api = async (url, options = {}) => { const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Request failed.'); return data; };
function setFeedback(id, message, error = false) { const el = $(id); el.textContent = message; el.classList.toggle('error', error); }
function step(name) { ['github', 'defense', 'certificate'].forEach(key => $(`#${key}-step`).classList.toggle('active', key === name)); }
function showPanel(name) { ['github', 'defense', 'certificate'].forEach(key => $(`#${key}-panel`).classList.toggle('hidden', key !== name)); step(name); }
function certificate(assessment, user) { $('#score').textContent = `${assessment.score}%`; $('#certificate-name').textContent = user.name; $('#certificate-repo').textContent = assessment.repo.replace(/^https:\/\/(www\.)?github\.com\//, ''); $('#certificate-id').textContent = `CERTIFICATE ${assessment.certificateId} · ${new Date(assessment.createdAt).toLocaleDateString()}`; $('#certificate-copy').textContent = assessment.score >= 80 ? 'Strong, specific answers. Your certificate is ready to share.' : 'Your certificate records a thoughtful defense. Add more specificity next time to raise your score.'; showPanel('certificate'); }
questions.forEach((question, index) => { const box = document.createElement('div'); box.className = 'question'; box.innerHTML = `<label>${index + 1}. ${question}<textarea name="answer" required minlength="20" placeholder="Be specific — 2–4 sentences is a great start."></textarea></label>`; $('#questions').append(box); });
(async () => { if (!token) return location.replace('/'); try { const { user } = await api('/api/me'); $('#profile').textContent = `${user.name} · Dashboard`; $('#github-url').value = user.github || ''; if (user.github) showPanel('defense'); const latest = await api('/api/assessments/latest'); if (latest.assessment) certificate(latest.assessment, user); window.proofUser = user; } catch { localStorage.removeItem('proof-token'); location.replace('/'); } })();
$('#github-form').addEventListener('submit', async event => { event.preventDefault(); try { const { user } = await api('/api/profile/github', { method: 'PATCH', body: JSON.stringify({ github: $('#github-url').value.trim() }) }); window.proofUser = user; setFeedback('#github-feedback', 'GitHub connected. Your evidence is ready.'); setTimeout(() => showPanel('defense'), 450); } catch (error) { setFeedback('#github-feedback', error.message, true); } });
$('#defense-form').addEventListener('submit', async event => { event.preventDefault(); const answers = [...document.querySelectorAll('[name="answer"]')].map(field => field.value); try { const { assessment } = await api('/api/assessments', { method: 'POST', body: JSON.stringify({ repo: $('#repo').value.trim(), answers }) }); certificate(assessment, window.proofUser); } catch (error) { setFeedback('#defense-feedback', error.message, true); } });
$('#print-certificate').addEventListener('click', () => window.print());
$('#another-project').addEventListener('click', () => { $('#defense-form').reset(); showPanel('defense'); });
