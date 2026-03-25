import { IsEthereumAddress, IsString } from "class-validator";

export class CreateBorrowPreviewDto {
  @IsEthereumAddress()
  owner!: string;

  @IsEthereumAddress()
  borrowerWallet!: string;

  @IsString()
  borrowAmount!: string;
}
