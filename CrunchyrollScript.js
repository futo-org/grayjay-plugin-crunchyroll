//#region constants
const CONTENT_DETAIL_REGEX = /^https:\/\/www\.crunchyroll\.com\/watch\/([A-Z0-9]*?)\//;
const SERIES_REGEX = /https?:\/\/www\.crunchyroll\.com\/series\/([A-Z0-9]+)(?:\/|$)/;
const SERIES_URL_PREFIX = "https://www.crunchyroll.com/series/";
const PLATFORM = "Crunchyroll";
const REGEX_INTERNAL_PLAYLIST_URL = /^https:\/\/grayjay\.internal\/Crunchyroll\/playlist\/([A-Z0-9]+)(?:\?.*)?$/;
// const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0" as const
// set missing constants
Type.Order.Chronological = "Latest releases";
Type.Order.Views = "Most played";
Type.Order.Favorites = "Most favorited";
Type.Feed.Playlists = "PLAYLISTS";
Type.Feed.Albums = "ALBUMS";
let local_settings;
/** State */
let local_state = {
    headers: {},
    channels: {}
};
let config = {};
let UNAVAILABLE_OPTIONS = [];
//#endregion
//#region source methods
const local_source = {
    enable,
    disable,
    saveState,
    getHome,
    getChannel,
    getChannelContents,
    getChannelPlaylists,
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
    config = conf;
    local_settings = settings;
    UNAVAILABLE_OPTIONS = loadOptionsForSetting("premiumContentUnavailableIndex");
    if (IS_TESTING) {
        local_settings.premiumContentUnavailableIndex = 0; // As locked content
    }
    log(local_settings);
    if (saved_state) {
        local_state = JSON.parse(saved_state);
    }
    else {
        const html = http.GET("https://www.crunchyroll.com/", {}, true).body;
        const match_result = html.match(/,"accountAuthClientId":"([_a-z0-9]*?)","/);
        if (match_result === null || match_result[1] === undefined) {
            throw new ScriptException("regex error");
        }
        const accountAuthClientId = match_result[1];
        const auth = utility.toBase64(string_to_bytes(`${accountAuthClientId}:`));
        const token_url = "https://www.crunchyroll.com/auth/v1/token";
        // TODO the bearer token likely needs to be refreshed after some amount of time
        // here is an example for Spotify if that's helpful
        // https://gitlab.futo.org/videostreaming/plugins/spotify/-/blob/master/src/SpotifyScript.ts?ref_type=heads#L255
        function get_bearer() {
            if (bridge.isLoggedIn()) {
                const response = JSON.parse(http.POST(token_url, "grant_type=etp_rt_cookie", {
                    Authorization: `Basic ${auth}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                }, true).body);
                return response.access_token;
            }
            else {
                const response = JSON.parse(http.POST(token_url, "grant_type=client_id", {
                    Authorization: `Basic ${auth}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Etp-Anonymous-Id": "6ba29c34-469b-4597-9d0d-9bbc672fb2d7"
                }, false).body);
                return response.access_token;
            }
        }
        local_state.headers = {
            Authorization: `Bearer ${get_bearer()}`
        };
    }
}
//#endregion
function disable() {
    log("Crunchyroll log: disabling");
}
function saveState() {
    return JSON.stringify(local_state);
}
//#region home
function getHome() {
    let results = [];
    const personalizationResponse = http.GET(`https://www.crunchyroll.com/personalization/v1/personalization?collectionId=Curation_Collections%2FEditorial%2FOctober_2024_Seasonal_Sampler&vendor=thinkanalytics`, local_state.headers, true);
    if (personalizationResponse.isOk) {
        const recommendations = JSON.parse(personalizationResponse.body).recommendations ?? [];
        const ids = recommendations.map((i) => i.contentItemId);
        const episodeResponse = http.GET(`https://www.crunchyroll.com/content/v2/cms/objects/${ids.join(",")}?ratings=true`, local_state.headers, true);
        const episodes = JSON.parse(episodeResponse.body)?.data ?? [];
        results = episodes.map(e => episodeToPlatformVideo(e));
    }
    return new ContentPager(results, false);
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
    const searchQuery = query.split(" ").join("+");
    const url = `https://www.crunchyroll.com/content/v2/discover/search?q=${searchQuery}&n=100&type=episode&ratings=true&locale=en-US`;
    const response = http.GET(url, local_state.headers, true);
    const contentList = [];
    if (response.isOk) {
        const searchResults = JSON.parse(response.body)?.data ?? [];
        searchResults.forEach((searchResult) => {
            // handle other types in the future
            if (searchResult.type === "episode") {
                searchResult.items.forEach((metadata) => {
                    contentList.push(episodeToPlatformVideo(metadata));
                });
            }
        });
    }
    return new ContentPager(contentList, false);
}

function episodeToPlatformVideo(episode, opts = { isPlaylist: false }) {

    if (!episode.episode_metadata) {
        episode.episode_metadata = episode;
    }

    const t = episode?.images?.thumbnail?.[0]?.map((image) => new Thumbnail(image.source, image.height)) ?? [];
    const thumbnails = new Thumbnails(t);
    const url = `https://www.crunchyroll.com/watch/${episode.id}/${episode.slug_title}`;

    const isPremiumOnly = episode?.episode_metadata?.availability_status === 'premium_only';
    const isLoggedIn = bridge.isLoggedIn();
    const premiumContentUnavailableOption = UNAVAILABLE_OPTIONS[local_settings.premiumContentUnavailableIndex];
    const userIsPremium = false; //TODO
    const shouldShowContent = opts.isPlaylist || !isPremiumOnly || userIsPremium || premiumContentUnavailableOption === "As regular content";

    const author = new PlatformAuthorLink(new PlatformID(PLATFORM, episode?.episode_metadata?.series_id, plugin.config.id), (episode.episode_metadata.series_title), `${SERIES_URL_PREFIX}${(episode.episode_metadata.series_id)}/${(episode.episode_metadata.series_slug_title)}`);
    const datetime = new Date(episode.episode_metadata.upload_date).getTime() / 1000;
    const durationInMs = episode?.episode_metadata?.duration_ms ?? 0;

    const premiumSuffix = isPremiumOnly && !userIsPremium ? ' (premium)' : '';
    
    const name = `S${episode.episode_metadata.season_number}E${episode.episode_metadata.episode_number} - ${episode.title} ${premiumSuffix}`;

    if (shouldShowContent) {
        return new PlatformVideo({
            id: new PlatformID(PLATFORM, episode.id, plugin.config.id),
            name,
            thumbnails: thumbnails,
            author,
            datetime,
            url,
            duration: durationInMs ? durationInMs / 1000 : 0,
            isLive: false,
            shareUrl: url
        });
    }
    else if (premiumContentUnavailableOption === "As locked Content") {
        const lockDescription = isLoggedIn ? 'This content is only available to premium users' : 'Login with a premium account to watch';
        const unlockUrl = isLoggedIn ? "https://www.crunchyroll.com/premium" : "";
        return new PlatformLockedContent({
            id: new PlatformID(PLATFORM, episode.id, plugin.config.id),
            name,
            author,
            datetime,
            lockDescription,
            unlockUrl,
        });
    }
}

function getChannel(url) {
    const seriesId = extractSeriesId(url);
    if (!seriesId) {
        throw new ScriptException("Invalid channel URL");
    }

    if (local_state.channels[seriesId]) {
        return local_state.channels[seriesId];
    }

    const channel = getObjectMetadata(seriesId, { first: true });
    const thumbnails = channel?.images?.poster_tall?.[0] ?? [{ source: '' }];
    const banners = channel?.images?.poster_wide?.[0] ?? [{ source: '' }];
    local_state.channels[seriesId] = new PlatformChannel({
        id: new PlatformID(PLATFORM, seriesId, plugin.config.id),
        name: channel.title,
        thumbnail: thumbnails[thumbnails.length - 1].source, //TODO: add setting to select thumbnail quality
        banner: banners[banners.length - 1].source, //TODO: add setting to select thumbnail quality
        subscribers: 0,
        description: channel?.description ?? '',
        url,
        // links
    });

    return local_state.channels[seriesId];
}
function getChannelContents(url) {

    const seriesId = extractSeriesId(url);

    if (!seriesId) {
        throw new ScriptException("Invalid channel URL");
    }

    const seasonsResponse = http
        .GET(`https://www.crunchyroll.com/content/v2/cms/series/${seriesId}/seasons?force_locale=&locale=en-US`, local_state.headers, true);

    if (!seasonsResponse.isOk) {
        throw new ScriptException("Failed to fetch serie season");
    }

    const seasonIdList = JSON.parse(seasonsResponse.body)?.data?.toReversed()?.map(e => e.id) ?? [];

    class ChannelContentVideoPager extends VideoPager {
        constructor(
            {
                videos = [],
                hasMore = true,
                context = { offset: 0, seasonIdList: [] },
            }
        ) {
            super(videos, hasMore, context);

        }

        nextPage() {

            const platformVideos = getSeasonEpisodes(this.context.seasonIdList[this.context.offset], { isPlaylist: false })?.toReversed() ?? [];

            const offset = this.context.offset + 1;

            return new ChannelContentVideoPager({
                context: { offset, seasonIdList: this.context.seasonIdList },
                videos: platformVideos,
                hasMore: offset < this.context.seasonIdList.length,
            });
        }
    }

    return new ChannelContentVideoPager({ context: { seasonIdList: seasonIdList, offset: 0 } }).nextPage();

}

function getChannelPlaylists(url) {

    const seriesId = extractSeriesId(url);

    if (!seriesId) {
        throw new ScriptException("Invalid channel URL");
    }

    const [serieInfoResponse, seasonsResponse] = http
        .batch()
        .GET(`https://www.crunchyroll.com/content/v2/cms/objects/${seriesId}?ratings=true`, local_state.headers, false)
        .GET(`https://www.crunchyroll.com/content/v2/cms/series/${seriesId}/seasons?force_locale=&locale=en-US`, local_state.headers, true)
        .execute();

    if (!serieInfoResponse.isOk) {
        throw new ScriptException("Failed to fetch serie info");
    }

    if (!seasonsResponse.isOk) {
        throw new ScriptException("Failed to fetch serie season");
    }

    const seasons = JSON.parse(seasonsResponse.body)?.data?.toReversed() ?? [];
    const serieInfo = JSON.parse(serieInfoResponse.body)?.data[0] ?? {};
    const thumbnails = serieInfo?.images?.poster_wide?.[0] ?? [{ source: '' }];

    const serieTitle = serieInfo.title;

    let contentList = [];

    seasons.forEach((season) => {

        const name = `Season ${season.season_number} - ${season.title}`;

        const params = objectToUrlEncodedString({
            name,
            serieTitle,
            serieUrl: url,
            seriesId
        });

        const playlistUrl = `https://grayjay.internal/${PLATFORM}/playlist/${season.id}?${params}`;

        const content = new PlatformPlaylist({
            id: new PlatformID(PLATFORM, season.series_id, plugin.config.id),
            author: new PlatformAuthorLink(
                new PlatformID(PLATFORM, seriesId, plugin.config.id),
                serieTitle,
                url
            ),
            name,
            thumbnail: thumbnails[thumbnails.length - 1].source,
            videoCount: season.number_of_episodes,
            datetime: 0,
            url: playlistUrl,
        });

        contentList.push(content);

    });

    return new ContentPager(contentList, false);

}

function getSeasonEpisodes(seasonId, opts = { isPlaylist: true }) {
    const seasonEpisodes = http.GET(`https://www.crunchyroll.com/content/v2/cms/seasons/${seasonId}/episodes?locale=en-US`, local_state.headers, true);

    if (!seasonEpisodes.isOk) {
        throw new ScriptException("Failed to fetch season episodes");
    }

    const episodes = JSON.parse(seasonEpisodes.body)?.data ?? [];

    return episodes.map(e => episodeToPlatformVideo(e, opts));
}

source.getPlaylist = function (url) {

    if (!url) {
        throw new ScriptException(`Invalid playlist URL: ${url}`);
    }

    const seasonId = extractSeasonId(url);

    if (!seasonId) {
        throw new ScriptException(`Invalid playlist URL: ${url}`);
    }

    const urlParams = new URLSearchParams(url.split('?')[1]);

    const name = urlParams.get('name');
    const serieTitle = urlParams.get('serieTitle') ?? '';
    const serieUrl = urlParams.get('serieUrl') ?? '';
    const seriesId = urlParams.get('seriesId') ?? '';


    const seasonEpisodes = getSeasonEpisodes(seasonId);

    return new PlatformPlaylistDetails({
        url: '',
        id: new PlatformID(PLATFORM, '', config.id),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, seriesId, config.id),
            serieTitle,// author name
            serieUrl,// author url
        ),
        name: name,// playlist name
        thumbnail: '',
        videoCount: seasonEpisodes.length ?? 0,
        contents: new VideoPager(seasonEpisodes),
        shareUrl: '',
    });
};

//#endregion
//#region content
function isContentDetailsUrl(url) {
    return CONTENT_DETAIL_REGEX.test(url);
}
// TODO one thing to figure out will be how to link to other dubbings. they are different content ids (urls)
// i don't think grayjay current has good support for the kind of structure crunchyroll uses. i'm not sure what the best approach will be
//
// TODO it's very easy to fill up the "active streams" for a premium account. there is likely an api call that is made when a tab closes that signals that the stream has ended. we'll need to send that request
function getContentDetails(url) {
    const video_id = url.match(CONTENT_DETAIL_REGEX)?.[1];
    if (video_id === undefined) {
        throw new ScriptException("regex error");
    }
    const responses = http
        .batch()
        .GET(`https://www.crunchyroll.com/content/v2/cms/objects/${video_id}?ratings=true`, local_state.headers, false)
        .GET(`https://cr-play-service.prd.crunchyrollsvc.com/v1/${video_id}/web/firefox/play`, local_state.headers, false)
        .execute();
    if (responses[0] === undefined || responses[1] === undefined) {
        throw new ScriptException("unreachable");
    }
    const episode_response = JSON.parse(responses[0].body);
    const play_response = JSON.parse(responses[1].body);
    const metadata = episode_response.data[0];
    if (metadata === undefined) {
        throw new ScriptException("missing episode metadata");
    }
    const image = metadata.images.thumbnail[0];
    if (image === undefined) {
        throw new ScriptException("missing episode thumbnail");
    }
    if (metadata.episode_metadata.is_premium_only && bridge.isLoggedIn() === false) {
        throw new LoginRequiredException("Login with a premium account to watch");
    }
    const thumbnails = new Thumbnails(image.map((image) => new Thumbnail(image.source, image.height)));
    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, metadata.id, plugin.config.id),
        name: `S${episode.episode_metadata.season_number}E${episode.episode_metadata.episode_number} - ${metadata.title} `,
        thumbnails: thumbnails,
        author: new PlatformAuthorLink(new PlatformID(PLATFORM, metadata.episode_metadata.series_id, plugin.config.id), metadata.episode_metadata.series_title, `${SERIES_URL_PREFIX}${metadata.episode_metadata.series_id}/${metadata.episode_metadata.series_slug_title}`),
        datetime: new Date(metadata.episode_metadata.upload_date).getTime() / 1000,
        url,
        duration: metadata.episode_metadata.duration_ms / 1000,
        isLive: false,
        shareUrl: url,
        description: metadata.description,
        video: new VideoSourceDescriptor([new DashWidevineSource({
            name: "Dash",
            duration: metadata.episode_metadata.duration_ms / 1000,
            url: play_response.url,
            requestModifier: {
                // headers for the manifest
                headers: local_state.headers,
            },
            licenseUri: "https://cr-license-proxy.prd.crunchyrollsvc.com/v1/license/widevine?specConform=true",
            getLicenseRequestExecutor: () => {
                return {
                    executeRequest: (url, _headers, _method, license_request_data) => {
                        if (license_request_data === null) {
                            throw new ScriptException("missing license request data");
                        }
                        const response = http.POST(url, license_request_data, {
                            ...local_state.headers,
                            "X-Cr-Content-Id": video_id,
                            "X-Cr-Video-Token": play_response.token,
                            "Content-Type": "application/octet-stream"
                        }, false).body;
                        return utility.fromBase64(response);
                    }
                };
            }
        })]),
        // TODO subtitles will be import to get right considering the vast options available likely subtitles and closed captions
        subtitles: [],
        // TODO I'm not usre if total is the total interactions or the total upvotes
        // consider using the star rating instead of the like and dislike rating
        rating: new RatingLikes(metadata.rating.total),
        // TODO add recommendations section (probably the "next episode" section)
        getContentRecommendations: () => new ContentPager([], false)
    });
}
//#endregion
//#region playlists
function isPlaylistUrl(url) {
    return isValidCrunchyrollSeasonUrl(url);
}
//#endregion
//#region channel
/**
 * Checks if a given URL is a Crunchyroll series URL.
 *
 * @param {string} url - The URL to check.
 * @returns {boolean} - True if the URL is a series URL, false otherwise.
 */
function isChannelUrl(url) {
    return SERIES_REGEX.test(url);
}
//#endregion
//#region other
function getUserSubscriptions() {
    return [];
}
//#endregion
//#region utilities
function assert_never(value) {
    log(value);
}
function log_passthrough(value) {
    log(value);
    return value;
}
function assert_exhaustive(value, exception_message) {
    log(["Crunchyroll log:", value]);
    if (exception_message !== undefined) {
        return new ScriptException(exception_message);
    }
    return;
}
function string_to_bytes(str) {
    const result = [];
    for (let i = 0; i < str.length; i++) {
        result.push(str.charCodeAt(i));
    }
    return new Uint8Array(result);
}
function loadOptionsForSetting(settingKey) {
    return config?.settings?.find((s) => s.variable == settingKey)
        ?.options ?? [];
}
/**
 * Extracts the series ID from a Crunchyroll series URL.
 *
 * @param {string} url - The Crunchyroll series URL.
 * @returns {string | null} - The extracted series ID or null if not found.
 */
function extractSeriesId(url) {
    const match = url.match(SERIES_REGEX);
    return match ? match[1] : null;
}
function getObjectMetadata(id, options = { first: false }) {
    const response = http.GET(`https://www.crunchyroll.com/content/v2/cms/objects/${id}?ratings=true`, local_state.headers, false);
    if (!response.isOk) {
        throw new ScriptException(`Failed to fetch metadata for content with ID ${id}`);
    }
    const data = JSON.parse(response.body)?.data ?? [];
    if (data.length && options.first) {
        return data[0];
    }
    return data;
}
function isValidCrunchyrollSeasonUrl(url) {
    return REGEX_INTERNAL_PLAYLIST_URL.test(url);
}
function extractSeasonId(url) {
    const match = url.match(REGEX_INTERNAL_PLAYLIST_URL);
    return match ? match[1] : null;
}
function objectToUrlEncodedString(obj) {
    const encodedParams = [];

    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const encodedKey = encodeURIComponent(key);
            const encodedValue = encodeURIComponent(obj[key]);
            encodedParams.push(`${encodedKey}=${encodedValue}`);
        }
    }

    return encodedParams.join('&');
}
//#endregion