//#region constants
const PLATFORM = "Crunchyroll";
const BASE_URL = "https://www.crunchyroll.com";
const CONTENT_DETAIL_REGEX = /^https:\/\/www\.crunchyroll\.com\/watch\/([A-Z0-9]+)(?:\/.*)?$/;
const SERIES_REGEX = /https?:\/\/www\.crunchyroll\.com\/series\/([A-Z0-9]+)(?:\/|$)/;
const SERIES_URL_PREFIX = "https://www.crunchyroll.com/series/";
const REGEX_INTERNAL_PLAYLIST_URL = /^https:\/\/grayjay\.internal\/Crunchyroll\/playlist\/([A-Z0-9]+)(?:\?.*)?$/;
const ITEMS_PER_PAGE = 100;
// const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0" as const
// set missing constants
Type.Order.Chronological = "Latest releases";
Type.Order.Views = "Most played";
Type.Order.Favorites = "Most favorited";
Type.Feed.Playlists = "PLAYLISTS";
Type.Feed.Albums = "ALBUMS";
let local_settings = {
    premiumContentUnavailableIndex: 0,
    preferedAudioLanguageOptionIndex: 0
};
/** State */
let local_state = {
    headers: {},
    channels: {},
    isPremium: false,
};
let config = {};
let UNAVAILABLE_OPTIONS = [];
let PREFERED_AUDIO_LANGUAGE_OPTIONS_VALUES = {};
let PREFERED_AUDIO_LANGUAGE_OPTIONS_KEYS = [];
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
    searchChannels,
    getSearchCapabilities,
    isContentDetailsUrl,
    getContentDetails,
    getContentChapters,
    getContentRecommendations,
    isChannelUrl,
    isPlaylistUrl,
    getUserSubscriptions
};
init_source(local_source);
function init_source(local_source) {
    for (const method_key of Object.keys(local_source)) {
        source[method_key] = local_source[method_key];
    }
}
//#endregion
//#region enable
function enable(conf, settings, saved_state) {
    config = conf;
    local_settings = settings;
    UNAVAILABLE_OPTIONS = loadOptionsForSetting("premiumContentUnavailableIndex");

    PREFERED_AUDIO_LANGUAGE_OPTIONS_VALUES = loadOptionsForSetting("preferedAudioLanguageOptionIndex")
        .filter(option => option !== "Original")
        .reduce((acc, option) => {
            const [langCode, langName] = option.split(" - ");
            acc[langCode] = { langCode, langName };
            return acc;
        }, {});

    PREFERED_AUDIO_LANGUAGE_OPTIONS_KEYS = Object.keys(PREFERED_AUDIO_LANGUAGE_OPTIONS_VALUES);

    if (IS_TESTING) {
        local_settings.premiumContentUnavailableIndex = 0; // As locked content
        local_settings.preferedAudioLanguageOptionIndex = 0; // Original
    }
    log(local_settings);

    let validAuthSession = false;

    if (saved_state) {
        local_state = JSON.parse(saved_state);
        validAuthSession = local_state.access_token_expires_at > Date.now();
    }


    if (!validAuthSession) {
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

            let response;

            if (bridge.isLoggedIn()) {
                response = JSON.parse(http.POST(token_url, "grant_type=etp_rt_cookie", {
                    Authorization: `Basic ${auth}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                }, true).body);

            }
            else {
                response = JSON.parse(http.POST(token_url, "grant_type=client_id", {
                    Authorization: `Basic ${auth}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Etp-Anonymous-Id": "6ba29c34-469b-4597-9d0d-9bbc672fb2d7"
                }, false).body);

            }

            return {
                access_token: response.access_token,
                access_token_expires_at: Date.now() + response.expires_in * 1000
            };
        }

        const { access_token, access_token_expires_at } = get_bearer();

        local_state.access_token_expires_at = access_token_expires_at;
        local_state.headers = {
            Authorization: `Bearer ${access_token}`,
        };


        if (bridge.isLoggedIn()) {

            const userResponse = http.GET("https://www.crunchyroll.com/accounts/v1/me", local_state.headers, true);

            if (userResponse.isOk) {
                const { external_id } = JSON.parse(userResponse.body);

                const userSubscriptionsResponse = http.GET(`https://www.crunchyroll.com/subs/v1/subscriptions/${external_id}/benefits`, local_state.headers, true);

                if (userSubscriptionsResponse.isOk) {
                    const userSubscriptions = JSON.parse(userSubscriptionsResponse.body);

                    local_state.isPremium = userSubscriptions.items.some(b => b.benefit === 'cr_premium');
                    local_state.concurrentStreams = userSubscriptions.items.find(b => b.benefit.startsWith('concurrent_streams'))?.benefit.split('.').pop();
                }
            }

        }
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

function getPreferedAudioLanguage() {
    // -1 Subtraction is done to account for the "Original" option and ignore it
    return local_settings.preferedAudioLanguageOptionIndex ? PREFERED_AUDIO_LANGUAGE_OPTIONS_KEYS[local_settings.preferedAudioLanguageOptionIndex - 1] : undefined;
}

function getHome() {
    class HomeContentVideoPager extends VideoPager {
        constructor(
            {
                videos = [],
                hasMore = true,
                context = { offset: 0 },
            } = {}
        ) {
            super(videos, hasMore, context);
        }

        nextPage() {
            const locale = local_settings?.preferLocale ?? "en-US";
            const start = this.context.offset || 0;
            const isFirstPage = start === 0;

            const query = objectToUrlEncodedString({
                type: "episode",
                preferred_audio_language: getPreferedAudioLanguage(),
                n: ITEMS_PER_PAGE,
                start,
                locale,
                sort_by: "newly_added",
                ratings: true,
            });

            let batchRequests = http.batch();
            batchRequests.GET(`${BASE_URL}/content/v2/discover/browse?${query}`, local_state.headers);

            if (isFirstPage) {
                batchRequests.GET(`${BASE_URL}/f/v1/home?locale=${locale}`, local_state.headers, true);
            }

            const responses = batchRequests.execute();

            if (!responses[0].isOk) {
                throw new ScriptException(`Failed to fetch discover page. Status: ${responses[0].status}`);
            }

            const discoverBody = JSON.parse(responses[0].body);

            let allEpisodes = [];
            if (isFirstPage && !local_state.isPremium) {
                const homeResponse = responses[1];
                if (!homeResponse.isOk) {
                    throw new ScriptException(`Failed to fetch home page. Status: ${homeResponse.status}`);
                }

                const homeBody = JSON.parse(homeResponse.body);
                const freeToWatchUrls = this.extractFreeToWatchUrls(homeBody);
                const freeToWatchResponses = this.fetchFreeToWatchContent(freeToWatchUrls);

                const recommendations = this.extractRecommendations(freeToWatchResponses);
                allEpisodes = this.fetchEpisodesByIds(recommendations);
            }

            const platformVideos = [...allEpisodes, ...discoverBody.data]
                .filter(filterEpisodeByAudioLocale)
                .map(e => episodeToPlatformVideo(e));

            const offset = this.context.offset + ITEMS_PER_PAGE;

            return new HomeContentVideoPager({
                context: { offset },
                videos: platformVideos,
                hasMore: offset < discoverBody.total,
            });
        }

        extractFreeToWatchUrls(homeBody) {
            const freeToWatch = homeBody?.children
                .filter(i => (
                    i.props.analyticsId.toLowerCase().includes("sampler") ||
                    i.props.analyticsId.toLowerCase().includes("free")
                ) && i.props.link)
                .map(i => i.props.link) ?? [];

            const freeToWatchFirstSeasonsUrl = homeBody?.children.find(
                i => i.props.analyticsId === "Curation_Collections/Editorial/Free-to-Watch_First_Seasons"
            )?.props?.link ?? '';

            const newEpisodesSeasonalSamplerUrl = homeBody?.children.find(
                i => i.props.analyticsId.includes("_Seasonal_Sampler")
            )?.props?.link ?? '';

            return new Set([...freeToWatch, freeToWatchFirstSeasonsUrl, newEpisodesSeasonalSamplerUrl]);
        }

        fetchFreeToWatchContent(urlSet) {
            let freeToWatchBatchRequests = http.batch();

            urlSet.forEach(url => {
                freeToWatchBatchRequests.GET(`${BASE_URL}${url}`, local_state.headers, true);
            });

            return freeToWatchBatchRequests.execute();
        }

        extractRecommendations(freeToWatchResponses) {
            let recommendationsSet = new Set();

            freeToWatchResponses.forEach(response => {
                if (!response.isOk) {
                    throw new ScriptException("Failed to fetch free-to-watch content");
                }

                const freeToWatchBody = JSON.parse(response.body);
                const freeToWatchEpisodes = freeToWatchBody?.recommendations.map(i => i.contentItemId) ?? [];

                freeToWatchEpisodes.forEach(id => recommendationsSet.add(id));
            });

            return Array.from(recommendationsSet);
        }

        fetchEpisodesByIds(ids) {
            if (!ids.length) return [];

            const episodeResponse = http.GET(
                `${BASE_URL}/content/v2/cms/objects/${ids.join(",")}?ratings=true`,
                local_state.headers,
                true
            );

            if (!episodeResponse.isOk) {
                throw new ScriptException("Failed to fetch episode details");
            }

            return JSON.parse(episodeResponse.body)?.data ?? [];
        }
    }

    return new HomeContentVideoPager().nextPage();

}

//#endregion
//#region search
function getSearchCapabilities() {
    return new ResultCapabilities([
        Type.Feed.Videos
    ], [], []);
}

function filterEpisodeByAudioLocale(episode) {
    return !getPreferedAudioLanguage() || episode.episode_metadata.audio_locale === !getPreferedAudioLanguage();
}

function search(query, type, order, filters) {
    log(query, order, filters, type);
    type = 'episode';
    return genericSearch(query, type, order, filters);
}

function searchChannels(query, type, order, filters) {
    log(query, order, filters, type);
    type = 'series';
    return genericSearch(query, type, order, filters);
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

    const queryString = objectToUrlEncodedString({
        locale: "en-US",
        preferred_audio_language: getPreferedAudioLanguage(),
    });

    const seasonsResponse = http
        .GET(`https://www.crunchyroll.com/content/v2/cms/series/${seriesId}/seasons?${queryString}`, local_state.headers, true);

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

function getSeasonEpisodes(seasonId, opts = { isPlaylist: true, filterCb: null }) {

    if (!opts.filterCb) {
        opts.filterCb = () => true;
    }

    const queryString = objectToUrlEncodedString({
        locale: "en-US",
        preferred_audio_language: getPreferedAudioLanguage(),
    });

    const seasonEpisodes = http.GET(`https://www.crunchyroll.com/content/v2/cms/seasons/${seasonId}/episodes?${queryString}`, local_state.headers, true);

    if (!seasonEpisodes.isOk) {
        throw new ScriptException("Failed to fetch season episodes");
    }

    const episodes = JSON.parse(seasonEpisodes.body)?.data ?? [];

    return episodes
        .filter(opts.filterCb)
        .map(e => episodeToPlatformVideo(e, opts));
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

function getContentRecommendations(url, nextEpisodeResponseInitialData) {
    let nextEpisodeResponse;

    if (!nextEpisodeResponseInitialData) {
        return new ContentPager([], false);
    }

    nextEpisodeResponse = nextEpisodeResponseInitialData;

    const nextEpisode = (JSON.parse(nextEpisodeResponse.body)?.data ?? []).map(episodeToPlatformVideo);


    if (!nextEpisode?.length) {
        return new ContentPager([], false);
    }

    return new ContentPager(nextEpisode, false);
}

function getContentChapters(url) {

    const videoId = url.match(CONTENT_DETAIL_REGEX)?.[1];

    const response = http.GET(`https://static.crunchyroll.com/skip-events/production/${videoId}.json`, {}, false);

    if (!response.isOk) {
        throw new ScriptException("Failed to fetch content chapters");
    }

    return Object.values(JSON.parse(response.body))
        .filter(skipEvent => typeof skipEvent === 'object')
        .map(skipEvent => {
            return {
                name: skipEvent.type,
                timeStart: skipEvent.start,
                timeEnd: skipEvent.end,
                type: Type.Chapter.NORMAL,
            }
        });
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

    if (!responses[1].isOk) {
        throw new ScriptException(`Failed to fetch play response: ${play_response.error}`);
    }

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

    const hardSubs = play_response?.hardSubs;

    let subsSources = [
        {
            hlang: play_response.audioLocale,
            url: play_response.url,
            priority: true
        },
    ];

    if (play_response?.hardSubs) {
        subsSources = [
            ...subsSources,
            ...Object.values(hardSubs).map(hardSub => {
                return {
                    hlang: hardSub.hlang,
                    url: hardSub.url,
                    isHardSub: true,
                    priority: false
                }
            })
        ];
    }

    const sources = subsSources.map(s => {

        const name = s.isHardSub ? `Hard Sub - ${s.hlang}` : s.hlang;
        return new DashWidevineSource({
            priority: !!s.priority,
            name: name,
            duration: metadata.episode_metadata.duration_ms / 1000,
            url: s.url,
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

                        const deleteActiveStream = http.request('DELETE', `https://www.crunchyroll.com/playback/v1/token/${video_id}/${play_response.token}`, local_state.headers, false);

                        if (!deleteActiveStream.isOk) {
                            bridge.toast(`Failed to delete active stream: ${deleteActiveStream.error}`);
                        }

                        return utility.fromBase64(response);
                    }
                };
            }
        });
    });


    const dubbedVersions = play_response.versions?.filter(v => !v.original && (!v.is_premium_only || local_state.isPremium));

    if (dubbedVersions?.length) {
        let alternateStreamsLabel = '<p>Alternate Streams dubs:</p>';

        play_response.versions.forEach((version) => {
            if (!version.original) {
                const versionUrl = `${BASE_URL}/watch/${version.guid}`;
                alternateStreamsLabel += `<p><a href="${versionUrl}">${PREFERED_AUDIO_LANGUAGE_OPTIONS_VALUES[version.audio_locale].langName} - ${version.audio_locale} dubbed Version</a></p>`;
            }
        });

        metadata.description += alternateStreamsLabel;
    }



    const thumbnails = new Thumbnails(image.map((image) => new Thumbnail(image.source, image.height)));
    const result = new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, metadata.id, plugin.config.id),
        name: `S${metadata.episode_metadata.season_number}E${metadata.episode_metadata.episode_number} - ${metadata.title} `,
        thumbnails: thumbnails,
        author: new PlatformAuthorLink(new PlatformID(PLATFORM, metadata.episode_metadata.series_id, plugin.config.id), metadata.episode_metadata.series_title, `${SERIES_URL_PREFIX}${metadata.episode_metadata.series_id}/${metadata.episode_metadata.series_slug_title}`),
        datetime: new Date(metadata.episode_metadata.upload_date).getTime() / 1000,
        url,
        duration: metadata.episode_metadata.duration_ms / 1000,
        isLive: false,
        shareUrl: url,
        description: metadata.description,
        video: new VideoSourceDescriptor(sources),
        // TODO subtitles will be import to get right considering the vast options available likely subtitles and closed captions
        subtitles: Object.values(play_response?.subtitles ?? {}).map(subtitleInfo => {
            return {
                name: subtitleInfo.language,
                url: subtitleInfo.url,
                format: "text/vtt",
                getSubtitles: () => {
                    const assSubtitleResponse = http.GET(subtitleInfo.url, {}, false);
                    if (assSubtitleResponse.isOk) {
                        const assSubtitle = assSubtitleResponse.body;
                        return assToVtt(assSubtitle);
                    }
                }
            }
        }),
        // TODO I'm not usre if total is the total interactions or the total upvotes
        // consider using the star rating instead of the like and dislike rating
        rating: new RatingLikes(metadata.rating.total),
    });

    result.getContentChapters = function () {
        return source.getContentChapters(url);
    }

    // TODO add recommendations section (probably the "next episode" section)
    result.getContentRecommendations = function () {
        const seasonVideos = getSeasonEpisodes(metadata.episode_metadata.season_id, { isPlaylist: false, filterCb: (e) => e.episode_number > metadata.episode_metadata.episode_number }) ?? [];
        return new ContentPager(seasonVideos, false);
    };

    return result;
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
function genericSearch(query, type, order, filters) {
    log(query, order, filters, type);
    const searchQuery = query.split(" ").join("+");

    const queryString = objectToUrlEncodedString({
        q: searchQuery,
        type,
        ratings: true,
        locale: "en-US",
        preferred_audio_language: getPreferedAudioLanguage(),
    });

    const url = `https://www.crunchyroll.com/content/v2/discover/search?${queryString}`;

    const response = http.GET(url, local_state.headers, true);
    const contentList = [];
    if (response.isOk) {
        const searchResults = JSON.parse(response.body)?.data ?? [];
        searchResults.forEach((searchResult) => {
            // handle other types in the future
            if (searchResult.type === "episode") {
                searchResult.items
                    .filter(filterEpisodeByAudioLocale)
                    .forEach((metadata) => {
                        contentList.push(episodeToPlatformVideo(metadata));
                    });
            }

            if (searchResult.type === "series") {
                searchResult.items
                    .filter(filterEpisodeByAudioLocale)
                    .forEach((metadata) => {
                        contentList.push(serieToPlatformChannel(metadata));
                    });
            }
        });
    }
    return new ContentPager(contentList, false);
}

function serieToPlatformChannel(serie) {

    const thumbnails = serie?.images?.poster_tall?.[0]?.map((image) => new Thumbnail(image.source, image.height)) ?? [];
    const url = `${SERIES_URL_PREFIX}${serie.id}/${serie.slug_title}`;

    return new PlatformChannel({
        id: new PlatformID(PLATFORM, serie.id, plugin.config.id),
        name: serie.title,
        thumbnail: thumbnails[thumbnails.length - 1].url, //TODO: add setting to select thumbnail quality
        banner: '',
        subscribers: 0,
        description: serie?.description ?? '',
        url,
        // links
    });
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
    const shouldShowContent = opts.isPlaylist || !isPremiumOnly || local_state.isPremium || premiumContentUnavailableOption === "As regular content";

    const author = new PlatformAuthorLink(new PlatformID(PLATFORM, episode?.episode_metadata?.series_id, plugin.config.id), (episode.episode_metadata.series_title), `${SERIES_URL_PREFIX}${(episode.episode_metadata.series_id)}/${(episode.episode_metadata.series_slug_title)}`);
    const datetime = new Date(episode.episode_metadata.upload_date).getTime() / 1000;
    const durationInMs = episode?.episode_metadata?.duration_ms ?? 0;

    const premiumSuffix = isPremiumOnly && !local_state.isPremium ? ' (premium)' : '';

    const name = `S${episode.episode_metadata.season_number}E${episode.episode_metadata.episode_number} ${premiumSuffix} - ${episode.title}`;

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
            const value = obj[key];

            if (value !== undefined && value !== null) {
                const encodedValue = encodeURIComponent(value);
                encodedParams.push(`${encodedKey}=${encodedValue}`);
            }

        }
    }

    return encodedParams.join('&');
}

function assToVtt(assContent) {

    function convertTime(assTime) {
        const [hours, minutes, seconds] = assTime.split(':');
        const [sec, millis] = seconds.split('.');
        const millisStr = millis ? millis.padEnd(3, '0') : '000'; // Default to 000 if no milliseconds
        return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:${sec.padStart(2, '0')}.${millisStr}`;
    }

    const vttLines = ["WEBVTT\n\n"];

    assContent
        .split(/\r?\n/)
        .filter(l => /^Dialogue:/.exec(l))
        .forEach(line => {
            const parts = line.split(',');

            // Ensure the line has at least 10 parts (in case there are missing fields)
            if (parts.length >= 10) {
                const startTime = convertTime(parts[1]);
                const endTime = convertTime(parts[2]);
                let text = parts[9].replace(/\\N/g, '\n'); // Handle newlines

                vttLines.push(`${startTime} --> ${endTime}`);
                vttLines.push(text);
                vttLines.push(''); // Blank line between captions
            }
        })

    return vttLines.join('\n');
}


//#endregion