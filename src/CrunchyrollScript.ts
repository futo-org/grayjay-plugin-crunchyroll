//#region constants
import {
    type State,
    type SearchTypes,
    type Settings,
    EpisodeResponse,
    Config,
    PlatformLockedContent,
} from "./types.js"

const CONTENT_DETAIL_REGEX = /^https:\/\/www\.crunchyroll\.com\/watch\/([A-Z0-9]*?)\//

const SERIES_URL_PREFIX = "https://www.crunchyroll.com/series/" as const

const PLATFORM = "Crunchyroll" as const
// const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0" as const

// const HARDCODED_ZERO = 0 as const
// const HARDCODED_EMPTY_STRING = "" as const
// const HARDCODED_THUMBNAIL_QUALITY = 1080 as const


// set missing constants
Type.Order.Chronological = "Latest releases"
Type.Order.Views = "Most played"
Type.Order.Favorites = "Most favorited"

Type.Feed.Playlists = "PLAYLISTS"
Type.Feed.Albums = "ALBUMS"

let local_settings: any
/** State */
let local_state: State
let config: Config = undefined;
let UNAVAILABLE_OPTIONS: string[] = [];
//#endregion

//#region source methods
const local_source: any = {
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
}
init_source(local_source)
function init_source<
    T extends { readonly [key: string]: string },
    S extends string,
    ChannelTypes extends FeedType,
    SearchTypes extends FeedType,
    ChannelSearchTypes extends FeedType
>(local_source: Source<T, S, ChannelTypes, SearchTypes, ChannelSearchTypes, Settings>) {
    for (const method_key of Object.keys(local_source)) {
        // @ts-expect-error assign to readonly constant source object
        source[method_key] = local_source[method_key]
    }
}
//#endregion

//#region enable
function enable(conf: Config, settings: Settings, saved_state?: string | null) {

    config = conf;

    UNAVAILABLE_OPTIONS = loadOptionsForSetting("premiumContentUnavailableIndex");

    if (IS_TESTING) {
        log("IS_TESTING true")
        log("logging configuration")
        log(conf)
        log("logging settings")
        log(settings)
        log("logging savedState")
        log(saved_state)
    }
    local_settings = settings

    log(local_settings)

    if (saved_state) {
        const state: State = JSON.parse(saved_state)
        local_state = state
    } else {
        const html = http.GET("https://www.crunchyroll.com/", {}, true).body

        const match_result = html.match(/,"accountAuthClientId":"([_a-z0-9]*?)","/)
        if (match_result === null || match_result[1] === undefined) {
            throw new ScriptException("regex error")
        }

        const accountAuthClientId = match_result[1]

        const auth = utility.toBase64(string_to_bytes(`${accountAuthClientId}:`))

        const token_url = "https://www.crunchyroll.com/auth/v1/token" as const

        // TODO the bearer token likely needs to be refreshed after some amount of time
        // here is an example for Spotify if that's helpful
        // https://gitlab.futo.org/videostreaming/plugins/spotify/-/blob/master/src/SpotifyScript.ts?ref_type=heads#L255
        function get_bearer() {
            if (bridge.isLoggedIn()) {
                const response: { readonly access_token: string } = JSON.parse(http.POST(
                    token_url,
                    "grant_type=etp_rt_cookie",
                    {
                        Authorization: `Basic ${auth}`,
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    true
                ).body)

                return response.access_token
            } else {
                const response: { readonly access_token: string } = JSON.parse(http.POST(
                    token_url,
                    "grant_type=client_id",
                    {
                        Authorization: `Basic ${auth}`,
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Etp-Anonymous-Id": "6ba29c34-469b-4597-9d0d-9bbc672fb2d7"
                    },
                    false
                ).body)

                return response.access_token
            }
        }

        local_state = { bearer_token: get_bearer() }
    }
}
//#endregion

function disable() {
    log("Crunchyroll log: disabling")
}

function saveState() {
    return JSON.stringify(local_state)
}

//#region home
function getHome() {

    let results = [] as IPlatformContent[];

    const headers = {
        Authorization: `Bearer ${local_state.bearer_token}`
    }

    const personalizationResponse = http.GET(`https://www.crunchyroll.com/personalization/v1/personalization?collectionId=Curation_Collections%2FEditorial%2FOctober_2024_Seasonal_Sampler&vendor=thinkanalytics`, headers, true) as any;

    if (personalizationResponse.isOk) {
        const recommendations = JSON.parse(personalizationResponse.body).recommendations ?? [];

        const ids = recommendations.map((i: { contentItemId: any }) => i.contentItemId);
        const episodeResponse = http.GET(`https://www.crunchyroll.com/content/v2/cms/objects/${ids.join(",")}?ratings=true`, headers, true) as any;
        const episodes: any[] = JSON.parse(episodeResponse.body)?.data ?? [];

        results = episodes.map(metadata => {

            const t = metadata.images.thumbnail?.[0]?.map((image: { source: string; height: number }) => new Thumbnail(image.source, image.height)) ?? [];

            const thumbnails = new Thumbnails(t);
            const url = `https://www.crunchyroll.com/watch/${metadata.id}/${metadata.slug_title}`;

            return new PlatformVideo({
                id: new PlatformID(PLATFORM, metadata.id.toString(), plugin.config.id),
                name: metadata.title,
                thumbnails: thumbnails,
                author: new PlatformAuthorLink(
                    new PlatformID(PLATFORM, metadata.episode_metadata.series_id, plugin.config.id),
                    metadata.episode_metadata.series_title,
                    `${SERIES_URL_PREFIX}/${metadata.episode_metadata.series_id}/${metadata.episode_metadata.series_slug_title}`
                ),
                datetime: new Date(metadata.episode_metadata.upload_date).getTime() / 1000,
                url,
                duration: metadata.episode_metadata.duration_ms / 1000,
                isLive: false,
                shareUrl: url
            })
        });
    }

    return new ContentPager(results, false)
}
//#endregion

//#region search
function getSearchCapabilities() {
    return new ResultCapabilities<string, SearchTypes>(
        [
            Type.Feed.Videos
        ],
        [],
        []
    )
}
function search(query: string, type: SearchTypes | null, order: Order | null, filters: FilterQuery<string> | null): ContentPager {
    log(query, order, filters, type);

    const searchQuery = query.split(" ").join("+");

    const url = `https://www.crunchyroll.com/content/v2/discover/search?q=${searchQuery}&n=100&type=episode&ratings=true&locale=en-US`;

    const headers = {
        Authorization: `Bearer ${local_state.bearer_token}`
    }

    const response = http.GET(url, headers, true) as any;

    const contentList: any[] = [];

    if (response.isOk) {
        const searchResults = JSON.parse(response.body)?.data ?? [];

        searchResults.forEach((searchResult: any) => {

            // handle other types in the future
            if (searchResult.type === "episode") {

                searchResult.items.forEach((metadata: any) => {
                    // const metadata = result;
                    const t = metadata?.images?.thumbnail?.[0]?.map((image: { source: string; height: number }) => new Thumbnail(image.source, image.height)) ?? [];

                    const thumbnails = new Thumbnails(t);
                    const url = `https://www.crunchyroll.com/watch/${metadata.id}/${metadata.slug_title}`;


                    const isPremiumOnly = metadata.episode_metadata.availability_status === 'premium_only';
                    const isLoggedIn = bridge.isLoggedIn();
                    const premiumContentUnavailableOption = UNAVAILABLE_OPTIONS[local_settings.premiumContentUnavailableIndex];
                    const userIsPremium = false;//TODO

                    const shouldShowContent = !isPremiumOnly || userIsPremium || premiumContentUnavailableOption === "As regular content";

                    if (shouldShowContent) {
                        contentList.push(new PlatformVideo({
                            id: new PlatformID(PLATFORM, metadata.id, plugin.config.id),
                            name: metadata.title,
                            thumbnails: thumbnails,
                            author: new PlatformAuthorLink(
                                new PlatformID(PLATFORM, metadata.episode_metadata.series_id, plugin.config.id),
                                metadata.episode_metadata.series_title,
                                `${SERIES_URL_PREFIX}/${metadata.episode_metadata.series_id}/${metadata.episode_metadata.series_slug_title}`
                            ),
                            datetime: new Date(metadata.episode_metadata.upload_date).getTime() / 1000,
                            url,
                            duration: metadata.episode_metadata.duration_ms / 1000,
                            isLive: false,
                            shareUrl: url
                        }));
                    } else if (premiumContentUnavailableOption === "As locked Content") {

                        const lockDescription = isLoggedIn ? 'This content is only available to premium users' : 'Login with a premium account to watch';
                        const unlockUrl = isLoggedIn ? "https://www.crunchyroll.com/premium" : "";

                        contentList.push(new PlatformLockedContent({
                            id: new PlatformID(PLATFORM, metadata.id, plugin.config.id),
                            name: metadata.title,
                            author: new PlatformAuthorLink(
                                new PlatformID(PLATFORM, metadata.episode_metadata.series_id, plugin.config.id),
                                metadata.episode_metadata.series_title,
                                `${SERIES_URL_PREFIX}/${metadata.episode_metadata.series_id}/${metadata.episode_metadata.series_slug_title}`
                            ),
                            datetime: new Date(metadata.episode_metadata.upload_date).getTime() / 1000,
                            lockDescription,
                            unlockUrl,
                        }));
                    }
                });
            }
        });
    }

    return new ContentPager(contentList, false)
}
//#endregion

//#region content
function isContentDetailsUrl(url: string) {
    return CONTENT_DETAIL_REGEX.test(url)
}
// TODO one thing to figure out will be how to link to other dubbings. they are different content ids (urls)
// i don't think grayjay current has good support for the kind of structure crunchyroll uses. i'm not sure what the best approach will be
//
// TODO it's very easy to fill up the "active streams" for a premium account. there is likely an api call that is made when a tab closes that signals that the stream has ended. we'll need to send that request
function getContentDetails(url: string) {
    const video_id = url.match(CONTENT_DETAIL_REGEX)?.[1]
    if (video_id === undefined) {
        throw new ScriptException("regex error")
    }

    const responses = http
        .batch()
        .GET(
            `https://www.crunchyroll.com/content/v2/cms/objects/${video_id}?ratings=true`,
            { Authorization: `Bearer ${local_state.bearer_token}` },
            false
        )
        .GET(
            `https://cr-play-service.prd.crunchyrollsvc.com/v1/${video_id}/web/firefox/play`,
            { Authorization: `Bearer ${local_state.bearer_token}` },
            false
        )
        .execute()

    if (responses[0] === undefined || responses[1] === undefined) {
        throw new ScriptException("unreachable")
    }

    const episode_response: EpisodeResponse = JSON.parse(
        responses[0].body
    )
    const play_response: {
        readonly url: string
        readonly token: string
    } = JSON.parse(responses[1].body)

    const metadata = episode_response.data[0]
    if (metadata === undefined) {
        throw new ScriptException("missing episode metadata")
    }
    const image = metadata.images.thumbnail[0]
    if (image === undefined) {
        throw new ScriptException("missing episode thumbnail")
    }

    if (metadata.episode_metadata.is_premium_only && bridge.isLoggedIn() === false) {
        throw new LoginRequiredException("Login with a premium account to watch")
    }

    const thumbnails = new Thumbnails(image.map((image) => new Thumbnail(image.source, image.height)))

    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, metadata.id, plugin.config.id),
        name: metadata.title,
        thumbnails: thumbnails,
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, metadata.episode_metadata.series_id, plugin.config.id),
            metadata.episode_metadata.series_title,
            `${SERIES_URL_PREFIX}/${metadata.episode_metadata.series_id}/${metadata.episode_metadata.series_slug_title}`
        ),
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
                headers: {
                    Authorization: `Bearer ${local_state.bearer_token}`
                }
            },
            licenseUri: "https://cr-license-proxy.prd.crunchyrollsvc.com/v1/license/widevine?specConform=true",
            getLicenseRequestExecutor: () => {
                return {
                    executeRequest: (url, _headers, _method, license_request_data) => {
                        if (license_request_data === null) {
                            throw new ScriptException("missing license request data")
                        }
                        const response = http.POST(
                            url,
                            license_request_data,
                            {
                                "Authorization": `Bearer ${local_state.bearer_token}`,
                                "X-Cr-Content-Id": video_id,
                                "X-Cr-Video-Token": play_response.token,
                                "Content-Type": "application/octet-stream"
                            },
                            false
                        ).body

                        return utility.fromBase64(response)
                    }
                }
            }
        })]),
        // TODO subtitles will be import to get right considering the vast options available likely subtitles and closed captions
        subtitles: [],
        // TODO I'm not usre if total is the total interactions or the total upvotes
        // consider using the star rating instead of the like and dislike rating
        rating: new RatingLikes(metadata.rating.total),
        // TODO add recommendations section (probably the "next episode" section)
        getContentRecommendations: () => new ContentPager([], false)
    })
}
//#endregion

//#region playlists
function isPlaylistUrl(url: string): boolean {
    return url === "xpi"
}
//#endregion

//#region channel
function isChannelUrl(url: string): boolean {
    return url === "kpr"
}
//#endregion

//#region other
function getUserSubscriptions(): string[] {
    return []
}
//#endregion

//#region utilities
function assert_never(value: never) {
    log(value)
}
function log_passthrough<T>(value: T): T {
    log(value)
    return value
}
function assert_exhaustive(value: never): void
function assert_exhaustive(value: never, exception_message: string): ScriptException
function assert_exhaustive(value: never, exception_message?: string): ScriptException | undefined {
    log(["Crunchyroll log:", value])
    if (exception_message !== undefined) {
        return new ScriptException(exception_message)
    }
    return
}
function string_to_bytes(str: string): Uint8Array {
    const result: number[] = []
    for (let i = 0; i < str.length; i++) {
        result.push(str.charCodeAt(i))
    }
    return new Uint8Array(result)
}
function loadOptionsForSetting(settingKey: string): string[] {
    return config?.settings?.find((s) => s.variable == settingKey)
        ?.options ?? [];
}
//#endregion

console.log(assert_exhaustive, assert_never, log_passthrough)
