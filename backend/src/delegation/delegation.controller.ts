import { BadRequestException, Body, Controller, Get, Post, Query } from "@nestjs/common";

import { CreateSplitPlanDto } from "./dto/create-split-plan.dto";
import { DelegationService } from "./delegation.service";

@Controller("delegations")
export class DelegationController {
  constructor(private readonly delegationService: DelegationService) {}

  @Get("split-plans/active")
  async getActiveSplitPlan(@Query("owner") owner?: string) {
    if (!owner) {
      throw new BadRequestException("owner query parameter is required");
    }

    return this.delegationService.getLatestSplitPlanForDisplay(owner);
  }

  @Get("owners/latest")
  async getLatestOwner(@Query("borrowerWallet") borrowerWallet?: string) {
    if (!borrowerWallet) {
      throw new BadRequestException("borrowerWallet query parameter is required");
    }

    const owner = await this.delegationService.getLatestOwnerForBorrowerOrThrow(borrowerWallet);
    return { owner };
  }

  @Get("positions")
  async getAllPositions(@Query("owner") owner?: string) {
    return this.delegationService.getAllPositionsForDisplay(owner);
  }

  @Post("split-plans")
  async createSplitPlan(@Body() dto: CreateSplitPlanDto) {
    return this.delegationService.createSplitPlan(dto);
  }
}
