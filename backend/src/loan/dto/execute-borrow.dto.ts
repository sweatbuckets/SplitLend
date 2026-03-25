import { IsEthereumAddress, IsString } from "class-validator";

export class ExecuteBorrowDto {
  @IsEthereumAddress()
  owner!: string;

  @IsEthereumAddress()
  borrowerWallet!: string;

  @IsEthereumAddress()
  receiver!: string;

  @IsString()
  borrowAmount!: string;
}
