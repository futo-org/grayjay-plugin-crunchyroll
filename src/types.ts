//#region custom types
export type Settings = {
    spotifyActivity: boolean
}

export type CrunchyrollSource = Required<Omit<Source<
    { readonly [key: string]: string },
    string,
    ChannelTypeCapabilities,
    SearchTypes,
    FeedType,
    Settings
>,
    "searchSuggestions"
    | "getComments"
    | "getSubComments"
    | "getSearchChannelContentsCapabilities"
    | "getLiveChatWindow"
    | "searchChannelContents"
    | "getContentRecommendations"
    | "getChannel"
    | "getChannelContents"
    | "getChannelCapabilities"
    | "searchChannels"
    | "getPlaylist"
    | "searchPlaylists"
    | "getChannelPlaylists"
    | "getPlaybackTracker"
    | "getUserPlaylists"
>>

export type State = {
    readonly bearer_token: string
}
export type ChannelTypeCapabilities = typeof Type.Feed.Playlists | typeof Type.Feed.Albums | typeof Type.Feed.Videos
export type SearchTypes = typeof Type.Feed.Videos
//#endregion

//#region JSON types

//#endregion
