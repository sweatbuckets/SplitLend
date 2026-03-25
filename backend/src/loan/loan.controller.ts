import { BadRequestException, Body, Controller, Get, Post, Query } from "@nestjs/common";

import { CreateBorrowPreviewDto } from "./dto/create-borrow-preview.dto";
import { CreateLiquidationPreviewDto } from "./dto/create-liquidation-preview.dto";
import { CreateQuoteDto } from "./dto/create-quote.dto";
import { CreateWithdrawPreviewDto } from "./dto/create-withdraw-preview.dto";
import { ExecuteBorrowDto } from "./dto/execute-borrow.dto";
import { ExecuteWithdrawDto } from "./dto/execute-withdraw.dto";
import { SyncPositionStateDto } from "./dto/sync-position-state.dto";
import { LoanService } from "./loan.service";

@Controller("loans")
export class LoanController {
  constructor(private readonly loanService: LoanService) {}

  @Get("policy")
  getOwnerPolicy(@Query("owner") owner?: string) {
    if (!owner) {
      throw new BadRequestException("owner query parameter is required");
    }

    return this.loanService.getOwnerPolicy(owner);
  }

  @Post("quote")
  createQuote(@Body() dto: CreateQuoteDto) {
    return this.loanService.createQuote(dto);
  }

  @Post("borrow-preview")
  createBorrowPreview(@Body() dto: CreateBorrowPreviewDto) {
    return this.loanService.createBorrowPreview(dto);
  }

  @Post("borrow")
  executeBorrow(@Body() dto: ExecuteBorrowDto) {
    return this.loanService.executeBorrow(dto);
  }

  @Post("withdraw-preview")
  createWithdrawPreview(@Body() dto: CreateWithdrawPreviewDto) {
    return this.loanService.createWithdrawPreview(dto);
  }

  @Post("withdraw")
  executeWithdraw(@Body() dto: ExecuteWithdrawDto) {
    return this.loanService.executeWithdraw(dto);
  }

  @Post("liquidation-preview")
  createLiquidationPreview(@Body() dto: CreateLiquidationPreviewDto) {
    return this.loanService.createLiquidationPreview(dto);
  }

  @Post("positions/sync")
  syncPositionState(@Body() dto: SyncPositionStateDto) {
    return this.loanService.syncPositionStateByBorrower(dto.borrowerWallet);
  }
}
