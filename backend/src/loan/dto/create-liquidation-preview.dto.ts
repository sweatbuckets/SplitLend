import { IsEthereumAddress, IsString } from "class-validator";

export class CreateLiquidationPreviewDto {
  @IsEthereumAddress()
  borrowerWallet!: string;

  @IsString()
  repayAmount!: string;
}
