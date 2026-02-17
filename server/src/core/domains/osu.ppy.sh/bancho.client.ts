import type { Beatmap, Beatmapset } from "../../../types/general/beatmap";
import { RankStatusInt } from "../../../types/general/rankStatus";
import logger from "../../../utils/logger";
import { BaseClient } from "../../abstracts/client/base-client.abstract";
import type {
  DownloadOsuBeatmap,
  GetBeatmapOptions,
  GetBeatmapSetOptions,
  GetBeatmapsetsByBeatmapIdsOptions,
  GetBeatmapsOptions,
  ResultWithStatus,
  SearchBeatmapsetsOptions,
} from "../../abstracts/client/base-client.types";
import {
  ClientAbilities,
} from "../../abstracts/client/base-client.types";
import { BanchoService } from "./bancho-client.service";
import type { BanchoBeatmap, BanchoBeatmapset } from "./bancho-client.types";

export class BanchoClient extends BaseClient {
  private readonly banchoService = new BanchoService(this.baseApi);

  constructor() {
    super(
      {
        baseUrl: "https://osu.ppy.sh",
        abilities: [
          ClientAbilities.GetBeatmapById,
          ClientAbilities.GetBeatmapSetById,
          ClientAbilities.GetBeatmaps,
          ClientAbilities.DownloadOsuBeatmap,
          ClientAbilities.GetBeatmapsetsByBeatmapIds,
          ClientAbilities.SearchBeatmapsets,
        ],
      },
      {
        rateLimits: [
          {
            abilities: [
              ClientAbilities.GetBeatmapById,
              ClientAbilities.GetBeatmapSetById,
              ClientAbilities.GetBeatmaps,
              ClientAbilities.DownloadOsuBeatmap,
              ClientAbilities.GetBeatmapsetsByBeatmapIds,
              ClientAbilities.SearchBeatmapsets,
            ],
            routes: ["/"],
            limit: 1200,
            reset: 60,
          },
        ],
      },
    );

    logger.info("BanchoClient: initialized");
  }

  async getBeatmapSet(
    ctx: GetBeatmapSetOptions,
  ): Promise<ResultWithStatus<Beatmapset>> {
    if (ctx.beatmapSetId) {
      return await this.getBeatmapSetById(ctx.beatmapSetId);
    }

    throw new Error("Invalid arguments");
  }

  async getBeatmap(
    ctx: GetBeatmapOptions,
  ): Promise<ResultWithStatus<Beatmap>> {
    if (ctx.beatmapId) {
      return await this.getBeatmapById(ctx.beatmapId);
    }

    throw new Error("Invalid arguments");
  }

  async getBeatmaps(
    ctx: GetBeatmapsOptions,
  ): Promise<ResultWithStatus<Beatmap[]>> {
    const { ids } = ctx;

    const result = await this.api.get<{ beatmaps: BanchoBeatmap[] }>(
            `api/v2/beatmaps?${ids.map(id => `ids[]=${id}`).join("&")}`,
            {
              config: {
                headers: {
                  Authorization: `Bearer ${await this.osuApiKey}`,
                },
              },
            },
    );

    if (!result || result.status !== 200) {
      return { result: null, status: result?.status ?? 500 };
    }

    return {
      result: result.data?.beatmaps?.map((b: BanchoBeatmap) =>
        this.convertService.convertBeatmap(b),
      ),
      status: result.status,
    };
  }

  async getBeatmapsetsByBeatmapIds(
    ctx: GetBeatmapsetsByBeatmapIdsOptions,
  ): Promise<ResultWithStatus<Beatmapset[]>> {
    const { beatmapIds } = ctx;

    const result = await this.api.get<{ beatmaps: BanchoBeatmap[] }>(
            `api/v2/beatmaps?${beatmapIds.map(id => `ids[]=${id}`).join("&")}`,
            {
              config: {
                headers: {
                  Authorization: `Bearer ${await this.osuApiKey}`,
                },
              },
            },
    );

    if (!result || result.status !== 200) {
      return { result: null, status: result?.status ?? 500 };
    }

    return {
      result: result.data?.beatmaps?.map((b: BanchoBeatmap) =>
        this.convertService.convertBeatmapset({
          ...b.beatmapset,
          ...(b.convert
            ? { converts: [b.convert] }
            : { beatmaps: [b] }),
        } as BanchoBeatmapset),
      ),
      status: result.status,
    };
  }

  async searchBeatmapsets(
    ctx: SearchBeatmapsetsOptions,
  ): Promise<ResultWithStatus<Beatmapset[]>> {
    const statuses = ctx.status?.length
      ? ctx.status.map(status => this.rankStatusToBancho(status))
      : [undefined];

    const limit = ctx.limit ?? 50;
    const offset = ctx.offset ?? 0;

    const beatmapsets: BanchoBeatmapset[] = [];
    for (const status of statuses) {
      const result = await this.searchBeatmapsetsByStatus(ctx, status, {
        limit,
        offset,
      });

      if (result.status !== 200 || !result.result) {
        return result;
      }

      beatmapsets.push(...result.result);
    }

    const uniqueBeatmapsets = [...new Map(
      beatmapsets.map(beatmapset => [beatmapset.id, beatmapset]),
    ).values()];

    return {
      result: uniqueBeatmapsets
        .slice(offset, offset + limit)
        .map(beatmapset => this.convertService.convertBeatmapset(beatmapset)),
      status: 200,
    };
  }

  async downloadOsuBeatmap(
    ctx: DownloadOsuBeatmap,
  ): Promise<ResultWithStatus<ArrayBuffer>> {
    const result = await this.api.get<ArrayBuffer>(`osu/${ctx.beatmapId}`, {
      config: {
        responseType: "arraybuffer",
      },
    });

    if (!result || result.status !== 200 || !result.data) {
      return { result: null, status: result?.status ?? 500 };
    }
    else if (result.data.byteLength === 0) {
      return { result: null, status: 404 };
    }

    return { result: result.data, status: result.status };
  }

  private async getBeatmapSetById(
    beatmapSetId: number,
  ): Promise<ResultWithStatus<Beatmapset>> {
    const result = await this.api.get<BanchoBeatmapset>(
            `api/v2/beatmapsets/${beatmapSetId}`,
            {
              config: {
                headers: {
                  Authorization: `Bearer ${await this.osuApiKey}`,
                },
              },
            },
    );

    if (!result || result.status !== 200 || !result.data) {
      return { result: null, status: result?.status ?? 500 };
    }

    return {
      result: this.convertService.convertBeatmapset(result.data),
      status: result.status,
    };
  }

  private async getBeatmapById(
    beatmapId: number,
  ): Promise<ResultWithStatus<Beatmap>> {
    const result = await this.api.get<BanchoBeatmap>(
            `api/v2/beatmaps/${beatmapId}`,
            {
              config: {
                headers: {
                  Authorization: `Bearer ${await this.osuApiKey}`,
                },
              },
            },
    );

    if (!result || result.status !== 200 || !result.data) {
      return { result: null, status: result?.status ?? 500 };
    }

    return {
      result: this.convertService.convertBeatmap(result.data),
      status: result.status,
    };
  }

  private async searchBeatmapsetsByStatus(
    ctx: SearchBeatmapsetsOptions,
    status: string | undefined,
    pagination: { limit: number; offset: number },
  ): Promise<ResultWithStatus<BanchoBeatmapset[]>> {
    let cursorString: string | undefined;
    const beatmapsets: BanchoBeatmapset[] = [];

    while (beatmapsets.length < pagination.offset + pagination.limit) {
      const result = await this.api.get<{
        beatmapsets: BanchoBeatmapset[];
        cursor_string?: string;
      }>("api/v2/beatmapsets/search", {
        config: {
          headers: {
            Authorization: `Bearer ${await this.osuApiKey}`,
          },
          params: {
            q: ctx.query,
            m: ctx.mode,
            s: status,
            cursor_string: cursorString,
          },
        },
      });

      if (!result || result.status !== 200 || !result.data) {
        return { result: null, status: result?.status ?? 500 };
      }

      beatmapsets.push(...result.data.beatmapsets);

      if (!result.data.cursor_string) {
        break;
      }

      cursorString = result.data.cursor_string;
    }

    return { result: beatmapsets, status: 200 };
  }

  private rankStatusToBancho(status: RankStatusInt): string {
    switch (status) {
      case RankStatusInt.GRAVEYARD:
        return "graveyard";
      case RankStatusInt.WIP:
        return "wip";
      case RankStatusInt.PENDING:
        return "pending";
      case RankStatusInt.RANKED:
        return "ranked";
      case RankStatusInt.APPROVED:
        return "approved";
      case RankStatusInt.QUALIFIED:
        return "qualified";
      case RankStatusInt.LOVED:
        return "loved";
      default:
        return "any";
    }
  }

  private get osuApiKey() {
    return this.banchoService.getBanchoClientToken();
  }
}
