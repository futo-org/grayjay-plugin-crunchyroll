//#region constants
import {
    type State,
    type SearchTypes,
    type CrunchyrollSource,
    type Settings,
} from "./types.js"

const CONTENT_DETAIL_REGEX = /^https:\/\/www\.crunchyroll\.com\/watch\/([A-Z0-9]*?)\//

const PLATFORM = "Crunchyroll" as const
// const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0" as const

// const HARDCODED_ZERO = 0 as const
// const HARDCODED_EMPTY_STRING = "" as const
const HARDCODED_THUMBNAIL_QUALITY = 1080 as const

const local_http = http
const local_utility = utility

// set missing constants
Type.Order.Chronological = "Latest releases"
Type.Order.Views = "Most played"
Type.Order.Favorites = "Most favorited"

Type.Feed.Playlists = "PLAYLISTS"
Type.Feed.Albums = "ALBUMS"

let local_settings: Settings
/** State */
let local_state: State
//#endregion

//#region source methods
const local_source: CrunchyrollSource = {
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
function enable(conf: SourceConfig, settings: Settings, saved_state?: string | null) {
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
        local_state = { bearer_token: "eyJhbGciOiJSUzI1NiIsImtpZCI6IklOcHRNZEtSSUQ0Tl9KYlRSS0lMaHciLCJ0eXAiOiJKV1QifQ.eyJhbm9ueW1vdXNfaWQiOiJjNDIxZWE1ZS1mZmE1LTQ2MWItYWM4YS1iMDU0ZTc2ZjgxNDQiLCJiZW5lZml0cyI6W10sImNsaWVudF9pZCI6ImNyX2JhY2tlbmQiLCJjbGllbnRfdGFnIjoiMS4wLjAgYmV0YSIsImNvdW50cnkiOiJVUyIsImRldmljZV9pZCI6ImZlODc3ZGZhLTE4ZmQtNDk3Yi1hZmI5LTBlNzg4NTA3ZGJhMCIsImV0cF91c2VyX2lkIjoiMjYxNDRlZjQtZTZlZi01MWM0LTkyODMtMjM3ZDY3MTVlMTlhIiwiZXhwIjoxNzMxNjg0OTIxLCJqdGkiOiI4MGY0NzY5Mi01ZTE1LTQ5MzMtOWE3Yi1mYWIxN2U0MGY1ZjIiLCJtYXR1cml0eSI6Ik0yIiwib2F1dGhfc2NvcGVzIjoiYWNjb3VudCBjb250ZW50IG1wOmxpbWl0ZWQgb2ZmbGluZV9hY2Nlc3MiLCJwcm9maWxlX2lkIjoiMjYxNDRlZjQtZTZlZi01MWM0LTkyODMtMjM3ZDY3MTVlMTlhIiwicnRfaWQiOiJjc3JiaDd0ZjV2dHRmMzIzZzM0ZyIsInNjb3BlcyI6eyJjciI6eyJhY2NfaWQiOiIyNjE0NGVmNC1lNmVmLTUxYzQtOTI4My0yMzdkNjcxNWUxOWEiLCJleHRfaWQiOiIxMTg5Mjg1MzA5In19LCJzdGF0dXMiOiJBQ1RJVkUiLCJ0bnQiOiJjciJ9.mRkAziUyjdLmX88AMGCLYkHVUbkhrJh5EEbeFNJk6INGz574OrXMNkKpeKTi0j6wri4ZtNRr7z5H9JPQc5KRjYtCQuvAcRFnToqtKEF2551HNEfkZUzIJOgGNEMz17cnZcpw6JMTEVAIb6dsRA6ruiXLTLl-Xvs_xjDcUEBLIFamCNCDr4_MckvexgpKjpYxBRuI-L9mhQdiSBdkX82T_fI_QlpHf0f7IErrYbsQsHYeeUqPJ3Sd6IK8bM8WqyW31wcH6EVWUUaQ4V88byWb1KfY2hC_sBabDAcpTrucBhNOCYZRCiczXutBkRXxK-4LoRde2_iabdY1REOnO9D4iw" }
    }
}
//#endregion

function disable() {
    log("Spotify log: disabling")
}

function saveState() {
    return JSON.stringify(local_state)
}

//#region home
function getHome() {
    return new ContentPager([], false)
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
    log(query, order, filters, type)

    return new ContentPager([], false)
}
//#endregion

//#region content
function isContentDetailsUrl(url: string) {
    return CONTENT_DETAIL_REGEX.test(url)
}
function getContentDetails(url: string) {
    const video_id = url.match(CONTENT_DETAIL_REGEX)?.[1]

    if (video_id === undefined) {
        throw new ScriptException("regex error")
    }

    const html = local_http.GET(url, {}, true).body

    const match_result = html.match(/,"accountAuthClientId":"([_a-z0-9]*?)","/)
    if (match_result === null || match_result[1] === undefined) {
        throw new ScriptException("regex error")
    }

    const accountAuthClientId = match_result[1]

    const auth = local_utility.toBase64(string_to_bytes(`${accountAuthClientId}:`))

    function get_bearer() {
        if (bridge.isLoggedIn()) {
            const response: { readonly access_token: string } = JSON.parse(local_http.POST(
                "https://www.crunchyroll.com/auth/v1/token",
                "grant_type=etp_rt_cookie",
                {
                    Authorization: `Basic ${auth}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                true
            ).body)

            return response.access_token
        } else {
            const response: { readonly access_token: string } = JSON.parse(local_http.POST(
                "https://www.crunchyroll.com/auth/v1/token",
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

    const bearer = get_bearer()

    // log(response.access_token)

    const play_response: {
        readonly url: string
        readonly token: string
    } = JSON.parse(local_http.GET(
        // `https://cr-play-service.prd.crunchyrollsvc.com/v1/${video_id}/web/chrome/play`,
        `https://cr-play-service.prd.crunchyrollsvc.com/v1/${video_id}/web/firefox/play`,

        { Authorization: `Bearer ${bearer}` },
        false
    ).body)

    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, "vid", plugin.config.id),
        name: "string",
        thumbnails: new Thumbnails([new Thumbnail("blob", HARDCODED_THUMBNAIL_QUALITY)]),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, "erg", plugin.config.id),
            "ererh",
            "erhergh"
        ),
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
            url: play_response.url,
            requestModifier: {
                headers: {
                    Authorization: `Bearer ${bearer}`
                }
            },
            bearerToken: bearer,
            // licenseUri: "https://cr-license-proxy.prd.crunchyrollsvc.com/v1/license/widevine",
            licenseUri: "https://cr-license-proxy.prd.crunchyrollsvc.com/v1/license/widevine?specConform=true",
            // licenseUri: "https://lic.drmtoday.com/license-proxy-widevine/cenc",
            token: play_response.token,
            video_id
        })]),
        rating: new RatingLikes(11),
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
/**
 * Converts seconds to the timestamp format used in WebVTT
 * @param seconds 
 * @returns 
 */
function milliseconds_to_WebVTT_timestamp(milliseconds: number) {
    return new Date(milliseconds).toISOString().substring(11, 23)
}
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
    log(["Spotify log:", value])
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
//#endregion

console.log(assert_exhaustive, assert_never, log_passthrough, milliseconds_to_WebVTT_timestamp)
// export statements are removed during build step
// used for unit testing in CrunchyrollScript.test.ts
export { milliseconds_to_WebVTT_timestamp }
