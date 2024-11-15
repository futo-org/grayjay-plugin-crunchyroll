const PLATFORM = "Crunchyroll";
// const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0" as const
// const HARDCODED_ZERO = 0 as const
// const HARDCODED_EMPTY_STRING = "" as const
const HARDCODED_THUMBNAIL_QUALITY = 1080;
// const local_http = http
// const local_utility = utility
// set missing constants
Type.Order.Chronological = "Latest releases";
Type.Order.Views = "Most played";
Type.Order.Favorites = "Most favorited";
Type.Feed.Playlists = "PLAYLISTS";
Type.Feed.Albums = "ALBUMS";
let local_settings;
/** State */
let local_state;
//#endregion
//#region source methods
const local_source = {
    enable,
    disable,
    saveState,
    getHome,
    search,
    getSearchCapabilities,
    isContentDetailsUrl,
    getContentDetails,
    isChannelUrl,
    isPlaylistUrl,
    getUserSubscriptions
};
init_source(local_source);
function init_source(local_source) {
    for (const method_key of Object.keys(local_source)) {
        // @ts-expect-error assign to readonly constant source object
        source[method_key] = local_source[method_key];
    }
}
//#endregion
//#region enable
function enable(conf, settings, saved_state) {
    if (IS_TESTING) {
        log("IS_TESTING true");
        log("logging configuration");
        log(conf);
        log("logging settings");
        log(settings);
        log("logging savedState");
        log(saved_state);
    }
    local_settings = settings;
    log(local_settings);
    if (saved_state) {
        const state = JSON.parse(saved_state);
        local_state = state;
    }
    else {
        local_state = { bearer_token: "eyJhbGciOiJSUzI1NiIsImtpZCI6IklOcHRNZEtSSUQ0Tl9KYlRSS0lMaHciLCJ0eXAiOiJKV1QifQ.eyJhbm9ueW1vdXNfaWQiOiJjNDIxZWE1ZS1mZmE1LTQ2MWItYWM4YS1iMDU0ZTc2ZjgxNDQiLCJiZW5lZml0cyI6W10sImNsaWVudF9pZCI6ImNyX2JhY2tlbmQiLCJjbGllbnRfdGFnIjoiMS4wLjAgYmV0YSIsImNvdW50cnkiOiJVUyIsImRldmljZV9pZCI6ImZlODc3ZGZhLTE4ZmQtNDk3Yi1hZmI5LTBlNzg4NTA3ZGJhMCIsImV0cF91c2VyX2lkIjoiMjYxNDRlZjQtZTZlZi01MWM0LTkyODMtMjM3ZDY3MTVlMTlhIiwiZXhwIjoxNzMxNjQzODkyLCJqdGkiOiIwOTlmNTM1Mi00MTMwLTQ1OWYtOGMxMy1lODU0NjI3OGU5ZmIiLCJtYXR1cml0eSI6Ik0yIiwib2F1dGhfc2NvcGVzIjoiYWNjb3VudCBjb250ZW50IG1wOmxpbWl0ZWQgb2ZmbGluZV9hY2Nlc3MiLCJwcm9maWxlX2lkIjoiMjYxNDRlZjQtZTZlZi01MWM0LTkyODMtMjM3ZDY3MTVlMTlhIiwicnRfaWQiOiJjc3JiaDd0ZjV2dHRmMzIzZzM0ZyIsInNjb3BlcyI6eyJjciI6eyJhY2NfaWQiOiIyNjE0NGVmNC1lNmVmLTUxYzQtOTI4My0yMzdkNjcxNWUxOWEiLCJleHRfaWQiOiIxMTg5Mjg1MzA5In19LCJzdGF0dXMiOiJBQ1RJVkUiLCJ0bnQiOiJjciJ9.WQfiwheieJmdVHuE1MSCIp1tD7IbZVJcuN1M5rCi1WR09TuRQYQNLdn4aEFBAhOisDDra5IjeRsiejGy4teSjFwejdmu7QB6m789z5nWC4SS1ft63au26KwCL4GYb4I3DJMEnoOFPMAJM0FwEacQR8sNtEzS4UPbqvryCgDQHQfUllRGxqZ1YBs17dvKYnK1Smd6xVDTfO5jljYQfUmpZH2b41z92qQj_BYkOjIX3uKSMq_fsMUw5sXiNznfFnVhGcZIYN4Xu-NZ5kL7R-KxRUuAv5QCs6xdEU6UpaSc_EZplWTzQccqE9mosE1LZBS0-AhiPPtrKbtBuYM_-WvIMQ" };
    }
}
//#endregion
function disable() {
    log("Spotify log: disabling");
}
function saveState() {
    return JSON.stringify(local_state);
}
//#region home
function getHome() {
    return new ContentPager([], false);
}
//#endregion
//#region search
function getSearchCapabilities() {
    return new ResultCapabilities([
        Type.Feed.Videos
    ], [], []);
}
function search(query, type, order, filters) {
    log(query, order, filters, type);
    return new ContentPager([], false);
}
//#endregion
//#region content
function isContentDetailsUrl(url) {
    return url === "https://www.crunchyroll.com/watch/G31UXQ3NP/izuku-midoriya-origin";
}
function getContentDetails(url) {
    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, "vid", plugin.config.id),
        name: "string",
        thumbnails: new Thumbnails([new Thumbnail("blob", HARDCODED_THUMBNAIL_QUALITY)]),
        author: new PlatformAuthorLink(new PlatformID(PLATFORM, "erg", plugin.config.id), "ererh", "erhergh"),
        datetime: 11,
        url,
        duration: 11,
        viewCount: 11,
        isLive: false,
        shareUrl: url,
        description: "string",
        video: new VideoSourceDescriptor([new DashWidevineSource({
                name: "string",
                duration: 11,
                url: "https://cr-play-service.prd.crunchyrollsvc.com/v1/manifest/G31UXQ3NP/evs3/3608c1714f6b47068b7ea571c714d91c/assets/p/137f15962d676d1e171702f574f82a66_,4341064.mp4,4341065.mp4,4341063.mp4,4341061.mp4,4341062.mp4,189.txt,.urlset/manifest.mpd?playbackGuid=0e-bae20c6b-f1c4-4390-bd7e-1a1667df576f&accountid=26144ef4-e6ef-51c4-9283-237d6715e19a",
                // requestModifier: {
                //     headers: {
                //         Authorization: `Bearer ${local_state.bearer_token}`
                //     }
                // },
                bearerToken: local_state.bearer_token,
                licenseUri: "https://cr-license-proxy.prd.crunchyrollsvc.com/v1/license/widevine"
            })]),
        rating: new RatingLikes(11),
        getContentRecommendations: () => new ContentPager([], false)
    });
}
//#endregion
//#region playlists
function isPlaylistUrl(url) {
    return url === "xpi";
}
//#endregion
//#region channel
function isChannelUrl(url) {
    return url === "kpr";
}
//#endregion
//#region other
function getUserSubscriptions() {
    return [];
}
//#endregion
//#region utilities
/**
 * Converts seconds to the timestamp format used in WebVTT
 * @param seconds
 * @returns
 */
function milliseconds_to_WebVTT_timestamp(milliseconds) {
    return new Date(milliseconds).toISOString().substring(11, 23);
}
function assert_never(value) {
    log(value);
}
function log_passthrough(value) {
    log(value);
    return value;
}
function assert_exhaustive(value, exception_message) {
    log(["Spotify log:", value]);
    if (exception_message !== undefined) {
        return new ScriptException(exception_message);
    }
    return;
}
//#endregion
console.log(assert_exhaustive, assert_never, log_passthrough, milliseconds_to_WebVTT_timestamp);
// export statements are removed during build step
// used for unit testing in CrunchyrollScript.test.ts
// export { milliseconds_to_WebVTT_timestamp };
//# sourceMappingURL=CrunchyrollScript.js.map
