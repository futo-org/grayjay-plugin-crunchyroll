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
export type EpisodeResponse = {
    readonly data: {
        readonly description: string
        readonly id: string
        readonly channel_id: string
        readonly images: {
            readonly thumbnail: {
                readonly height: 1080 | 900
                readonly source: string
            }[][]
        }
        readonly title: string
        readonly rating: {
            readonly total: number
        }
        readonly episode_metadata: {
            /** e.g. "2018-04-08T00:00:00+09:00" */
            readonly upload_date: string
            readonly series_title: string
            readonly series_id: string
            readonly series_slug_title: string
            readonly is_premium_only: boolean
            readonly duration_ms: number
        }
    }[]
}

export type Config = {
    readonly id: string,
    readonly settings: any[],
} | undefined;


//#endregion
type PlatformLockedContentParams = {
    id: PlatformID;
    name: string;
    author: PlatformAuthorLink;
    datetime: number; // Timestamp in seconds
    lockDescription: string; // Optional, inferred from context
    unlockUrl: string; // Optional, inferred from context
  };
  
  export class PlatformLockedContent {
    id: PlatformID;
    name: string;
    author: PlatformAuthorLink;
    datetime: number;
    lockDescription: string;
    unlockUrl: string;
  
    constructor(params: PlatformLockedContentParams) {
      this.id = params.id;
      this.name = params.name;
      this.author = params.author;
      this.datetime = params.datetime;
      this.lockDescription = params?.lockDescription;
      this.unlockUrl = params?.unlockUrl;
    }
  }