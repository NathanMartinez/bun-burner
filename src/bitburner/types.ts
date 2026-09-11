/** A file identified by its game server and path. */
export interface FileLocation { server: string; filename: string }
/** Original source text; no transformation is performed by this client. */
export interface FileContent { filename: string; content: string }
/** Numeric timestamps as returned by Bitburner 3.0.1. */
export interface FileMetadata { filename: string; atime: number; btime: number; mtime: number }
/** The limited server summary exposed by the Remote API. */
export interface ServerInfo { hostname: string; hasAdminRights: boolean; purchasedByPlayer: boolean }
/** When binary is true, save encodes bytes as character codes, not base64. */
export interface SaveFile { identifier: string; binary: boolean; save: string }

/** Complete Bitburner 3.0.1 Remote API contract; this is not the Netscript API. */
export interface RemoteApi {
  /** List script and text filenames without reading their contents. */
  getFileNames: { params: { server: string }; result: string[] };
  /** Read the original content of a file. */
  getFile: { params: FileLocation; result: string };
  /** Read a file's numeric timestamps. */
  getFileMetadata: { params: FileLocation; result: FileMetadata };
  /** Create or overwrite a game file. Changes game state. */
  pushFile: { params: FileLocation & { content: string }; result: "OK" };
  /** Delete a game file. Changes game state. */
  deleteFile: { params: FileLocation; result: "OK" };
  /** Read all script and text contents on a server. */
  getAllFiles: { params: { server: string }; result: FileContent[] };
  /** Read metadata for all script and text files on a server. */
  getAllFileMetadata: { params: { server: string }; result: FileMetadata[] };
  /** Calculate an existing script's RAM cost without running it. */
  calculateRam: { params: FileLocation; result: number };
  /** Retrieve Netscript declarations from the connected game. */
  getDefinitionFile: { params: undefined; result: string };
  /** Export save data; may contain private gameplay information. */
  getSaveFile: { params: undefined; result: SaveFile };
  /** Discover game servers and their access/ownership flags. */
  getAllServers: { params: undefined; result: ServerInfo[] };
}

/** A union of tuples preserves method/parameter relationships, even for union inputs. */
export type RemoteCall<M extends keyof RemoteApi = keyof RemoteApi> = {
  [K in M]: RemoteApi[K]["params"] extends undefined
    ? [method: K]
    : [method: K, params: RemoteApi[K]["params"]];
}[M];
