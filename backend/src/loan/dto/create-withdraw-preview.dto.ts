import { IsEthereumAddress, IsString } from "class-validator";

export class CreateWithdrawPreviewDto {
  @IsEthereumAddress()
  owner!: string;

  @IsEthereumAddress()
  borrowerWallet!: string;

  @IsString()
  withdrawAmount!: string;
}
