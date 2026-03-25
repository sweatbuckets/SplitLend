import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEthereumAddress,
  IsNotEmpty,
  IsString,
  Matches
} from "class-validator";

export class CreateSplitPlanDto {
  @IsEthereumAddress()
  owner!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(16)
  @IsEthereumAddress({ each: true })
  wallets!: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(16)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  amounts!: string[];

  @IsString()
  @IsNotEmpty()
  totalCollateral!: string;

  @IsString()
  expiresAt!: string;

  @IsString()
  @Matches(/^0x[a-fA-F0-9]{64}$/)
  nonce!: string;

  @IsString()
  signature!: string;
}
