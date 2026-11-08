/**
 * ADFLIX 2.0 — JIYYAD TOOLS
 * Proxy ke Veloflix (veloflix.my.id)
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE = (process.env.VELOFLIX_BASE || 'https://veloflix.my.id').replace(/\/+$/, '');
const UA =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

app.use(cors());
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const client = axios.create({
  baseURL: BASE,
  timeout: 35000,
  headers: {
    'User-Agent': UA,
    Accept: 'application/json',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    Referer: BASE + '/',
    Origin: BASE,
  },
  validateStatus: () => true,
});

function wrap(data) {
  if (data == null) return data;
  if (data.data !== undefined) return data.data;
  return data;
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.id ?? raw.tmdbId ?? null;
  const mediaType = raw.mediaType || raw.media_type || raw.type || 'movie';
  return {
    id,
    mediaType,
    title: raw.title || raw.name || '',
    year: raw.year || (raw.releaseDate || raw.release_date || '').toString().slice(0, 4) || null,
    rating: raw.rating ?? raw.vote_average ?? null,
    posterUrl: raw.posterUrl || raw.poster_path || null,
    backdropUrl: raw.backdropUrl || raw.backdrop_path || null,
    overview: raw.overview || raw.description || '',
    genres: raw.genres || raw.genreIds || [],
    logoUrl: raw.logoUrl || null,
    releaseDate: raw.releaseDate || raw.release_date || null,
  };
}

function buildServers(type, id, season, episode) {
  const isTv = type === 'tv';
  const s = season || 1;
  const e = episode || 1;
  const tid = String(id);
  // 4 servers: mix with-ads / lighter
  if (isTv) {
    return [
      { id: 1, name: 'Server 1', label: 'VidSrc', ads: true, url: `https://vidsrc.xyz/embed/tv?tmdb=${tid}&season=${s}&episode=${e}` },
      { id: 2, name: 'Server 2', label: '2Embed', ads: true, url: `https://www.2embed.cc/embedtv/${tid}&s=${s}&e=${e}` },
      { id: 3, name: 'Server 3', label: 'EmbedSU', ads: false, url: `https://embed.su/embed/tv/${tid}/${s}/${e}` },
      { id: 4, name: 'Server 4', label: 'MultiEmbed', ads: false, url: `https://multiembed.mov/?video_id=${tid}&tmdb=1&s=${s}&e=${e}` },
    ];
  }
  return [
    { id: 1, name: 'Server 1', label: 'VidSrc', ads: true, url: `https://vidsrc.xyz/embed/movie?tmdb=${tid}` },
    { id: 2, name: 'Server 2', label: '2Embed', ads: true, url: `https://www.2embed.cc/embed/${tid}` },
    { id: 3, name: 'Server 3', label: 'EmbedSU', ads: false, url: `https://embed.su/embed/movie/${tid}` },
    { id: 4, name: 'Server 4', label: 'MultiEmbed', ads: false, url: `https://multiembed.mov/?video_id=${tid}&tmdb=1` },
  ];
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'ADFLIX 2.0', brand: 'JIYYAD TOOLS', source: BASE });
});

app.get('/api/home', async (req, res) => {
  try {
    const country = req.query.country || 'ID';
    const [m, t] = await Promise.all([
      client.get('/api/trending/country', { params: { country, type: 'movie', page: 1, lang: 'id' } }),
      client.get('/api/trending/country', { params: { country, type: 'tv', page: 1, lang: 'id' } }),
    ]);
    const movies = (wrap(m.data)?.items || wrap(m.data) || []).map(normalizeItem).filter(Boolean);
    const series = (wrap(t.data)?.items || wrap(t.data) || []).map(normalizeItem).filter(Boolean);
    res.json({ status: true, movies, series });
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ status: true, results: [] });
    const { data } = await client.get('/api/search', { params: { q } });
    const list = Array.isArray(wrap(data)) ? wrap(data) : wrap(data)?.items || wrap(data)?.results || [];
    res.json({ status: true, results: list.map(normalizeItem).filter(Boolean) });
  } catch (e) {
    res.status(500).json({ status: false, error: e.message, results: [] });
  }
});

app.get('/api/title/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    const { data } = await client.get(`/api/title/${type}/${id}`);
    const payload = wrap(data) || {};
    const detail = normalizeItem(payload) || {};
    Object.assign(detail, {
      overview: payload.overview || detail.overview,
      cast: Array.isArray(payload.cast) ? payload.cast.slice(0, 12) : [],
      genres: payload.genres || detail.genres,
      trailerYoutubeId: payload.trailerYoutubeId || null,
      seasons: payload.seasons || [],
      recommendations: (payload.recommendations || []).map(normalizeItem).filter(Boolean).slice(0, 12),
    });
    res.json({ status: true, detail });
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

app.get('/api/watch/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    const season = req.query.season || 1;
    const episode = req.query.episode || 1;
    const servers = buildServers(type, id, season, episode);
    res.json({
      status: true,
      type,
      id,
      season: Number(season),
      episode: Number(episode),
      servers,
    });
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

app.get('/api/category', async (req, res) => {
  try {
    const type = req.query.type || 'movie';
    const page = req.query.page || 1;
    // fallback: trending
    const { data } = await client.get('/api/trending/country', {
      params: { country: 'ID', type, page, lang: 'id' },
    });
    const items = (wrap(data)?.items || []).map(normalizeItem).filter(Boolean);
    res.json({
      status: true,
      items,
      currentPage: wrap(data)?.currentPage || Number(page),
      totalPages: wrap(data)?.totalPages || 1,
    });
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`ADFLIX 2.0 → http://localhost:${PORT}`));
