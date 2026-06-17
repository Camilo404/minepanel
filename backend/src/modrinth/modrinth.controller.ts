import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { ModrinthService } from './modrinth.service';
import { SearchModrinthModsQueryDto } from './dto/search-mods.query.dto';
import { SearchModrinthModpacksQueryDto } from './dto/search-modpacks.query.dto';

@Controller('modrinth')
@UseGuards(JwtAuthGuard)
export class ModrinthController {
  constructor(private readonly modrinthService: ModrinthService) {}

  @Get('mods/search')
  async searchMods(@Query() query: SearchModrinthModsQueryDto) {
    return this.modrinthService.searchMods({
      q: query.q,
      limit: query.limit,
      offset: query.offset,
      minecraftVersion: query.minecraftVersion,
      loader: query.loader,
    });
  }

  @Get('modpacks/search')
  async searchModpacks(@Query() query: SearchModrinthModpacksQueryDto) {
    return this.modrinthService.searchModpacks({
      q: query.q,
      limit: query.limit,
      offset: query.offset,
      index: query.index,
    });
  }

  @Get('modpacks/:idOrSlug')
  async getModpack(@Param('idOrSlug') idOrSlug: string) {
    return this.modrinthService.getModpack(idOrSlug);
  }
}
