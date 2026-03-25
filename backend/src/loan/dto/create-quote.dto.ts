import { IsEthereumAddress, IsString } from "class-validator";

export class CreateQuoteDto {
  @IsEthereumAddress()
  owner!: string;

  @IsString()
  requestedBorrowAmount!: string;
}
