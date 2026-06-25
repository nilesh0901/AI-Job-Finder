import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function scrapeJob(url) {
  const response = await axios.get(url, {
    timeout: 8000,
    headers: { 'User-Agent': USER_AGENT },
    maxRedirects: 5,
  });

  const $ = cheerio.load(response.data);

  // Remove noise
  $('script, style, nav, footer, header, [role="navigation"]').remove();

  // Title — try structured meta first, then board-specific selectors, then fallback
  const title =
    $('meta[property="og:title"]').attr('content') ||
    $('[data-testid="jobsearch-JobInfoHeader-title"]').text().trim() ||
    $('.job-details-jobs-unified-top-card__job-title').text().trim() ||
    $('h1').first().text().trim() ||
    $('title').text().split('|')[0].trim() ||
    '';

  // Company
  const company =
    $('meta[name="author"]').attr('content') ||
    $('[data-testid="inlineHeader-companyName"]').text().trim() ||
    $('.job-details-jobs-unified-top-card__company-name').text().trim() ||
    $('[class*="company"]').first().text().trim() ||
    '';

  // Location
  const location =
    $('[data-testid="job-location"]').text().trim() ||
    $('[class*="location"]').first().text().trim() ||
    '';

  // Description — og:description as starter, then longest text block
  let rawDescription =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    '';

  // Try to get fuller description from known selectors or body text
  const descSelectors = [
    '[data-testid="jobsearch-jobDescriptionText"]',
    '.job-description',
    '[class*="job-description"]',
    '[class*="jobDescription"]',
    '[class*="description"]',
    'article',
    'main',
  ];

  for (const sel of descSelectors) {
    const text = $(sel).text().trim();
    if (text.length > rawDescription.length) rawDescription = text;
  }

  // Last resort: full body text
  if (rawDescription.length < 200) {
    rawDescription = $('body').text().replace(/\s+/g, ' ').trim();
  }

  // Cap at 6000 chars
  rawDescription = rawDescription.slice(0, 6000);

  if (!title && !rawDescription) {
    throw new Error('Could not extract meaningful content from this URL');
  }

  return {
    title: title.slice(0, 200),
    company: company.slice(0, 200),
    location: location.slice(0, 200),
    rawDescription,
  };
}
