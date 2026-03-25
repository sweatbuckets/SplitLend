import { IsEthereumAddress, IsString, Matches } from "class-validator";

export class ExecuteWithdrawDto {
  @IsEthereumAddress()
  owner!: string;

  @IsEthereumAddress()
  borrowerWallet!: string;

  @IsEthereumAddress()
  to!: string;

  @IsString()
  withdrawAmount!: string;

  @IsString()
  expiresAt!: string;

  @IsString()
  @Matches(/^0x[a-fA-F0-9]{64}$/)
  nonce!: string;

  @IsString()
  ownerSignature!: string;
}
