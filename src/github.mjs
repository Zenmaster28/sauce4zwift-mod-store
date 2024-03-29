import * as net from './net.mjs';

export async function fetchGH(urn) {
    return await net.fetchProxy('gh', 'https://api.github.com', urn);
}


export async function getGithubUser(id) {
    return await fetchGH(`users/${id}`);
}


export async function getGithubRepo(org, repo) {
    return await fetchGH(`repos/${org}/${repo}`);
}


export async function getGithubRelease(org, repo, releaseId) {
    return await fetchGH(`repos/${org}/${repo}/releases/${releaseId}`);
}


export async function getGithubReleaseByTag(org, repo, tag) {
    return await fetchGH(`repos/${org}/${repo}/releases/tags/${tag}`);
}


export async function parseGithubRelease(entry) {
    const [repo, author, releases] = await Promise.all([
        getGithubRepo(entry.org, entry.repo),
        getGithubUser(entry.org),
        Promise.all(entry.releases.map(async x => {
            const rel = await getGithubRelease(entry.org, entry.repo, x.id);
            const trustedAsset = rel.assets.find(xx => xx.id === x.assetId);
            if (!trustedAsset) {
                console.warn("Trusted asset not found:", x, entry);
            } else {
                return {...rel, trustedAsset};
            }
        })).then(x => x.filter(xx => xx)),
    ]);
    if (repo.disabled || repo.archived || !releases.length) {
        return;
    }
    return {
        id: entry.id,
        name: repo.name,
        description: repo.description,
        homeURL: repo.homepage || repo.html_url,
        logoURL: entry.logoURL || author.avatar_url,
        tags: repo.topics,
        created: new Date(repo.created_at),
        authorName: author.name,
        authorURL: author.html_url,
        authorAvatarURL: author.avatar_url,
        releases: releases.map(x => {
            return {
                url: x.trustedAsset.browser_download_url,
                name: x.name,
                notes: x.body,
                version: x.tag_name,
                published: new Date(x.published_at),
                size: x.trustedAsset.size,
            };
        }),
    };
}
