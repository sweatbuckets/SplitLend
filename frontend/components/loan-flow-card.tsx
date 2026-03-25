"use client";

import { useEffect, useState, startTransition } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSignTypedData, useWriteContract } from "wagmi";
import { createPublicClient, formatEther, http, keccak256, parseEther, stringToHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import {
  collateralAddress,
  collateralAbi,
  debtAbi,
  debtAddress,
  lendingAbi,
  lendingAddress
} from "@/lib/contracts";
import { backendUrl, chainId } from "@/lib/env";

type QuoteResponse = {
  policyName?: string;
  borrowAmount: string;
  collateralRequired: string;
  ltvBps: number;
  liquidationLtvBps?: number;
  quoteExpiresAt: string;
};

type SplitWallet = {
  address: `0x${string}`;
  privateKey: `0x${string}`;
  percentage: number;
  collateralAmount: bigint;
};

type SplitPlanResponse = {
  splitPlanId: string;
  expiresAt: string;
  walletCount: number;
  allocationTxHash: `0x${string}`;
};

type ActiveSplitPlanResponse = {
  splitPlanId: string;
  owner: `0x${string}`;
  wallets: `0x${string}`[];
  amounts: string[];
  createdAts: string[];
  updatedAts?: string[];
  totalCollateral: string;
  expiresAt: string;
  walletCount: number;
};

type LatestOwnerResponse = {
  owner: `0x${string}`;
};

type BorrowPreviewResponse = {
  owner: `0x${string}`;
  borrowerWallet: `0x${string}`;
  borrowerAllocation: string;
  currentCollateral: string;
  currentDebt: string;
  policyLtvBps?: string;
  maxBorrow: string;
  receiver: `0x${string}`;
};

type ExecuteBorrowResponse = {
  txHash: `0x${string}`;
  status: "success" | "reverted";
  blockNumber: string;
  borrowerWallet: `0x${string}`;
  borrowAmount: string;
  receiver: `0x${string}`;
};

type WithdrawPreviewResponse = {
  borrowerWallet: `0x${string}`;
  owner: `0x${string}`;
  withdrawAmount: string;
  maxWithdrawAmount: string;
  currentCollateral: string;
  currentDebt: string;
  remainingCollateral: string;
  resultingLtvBps: string;
  policyLtvBps?: string;
  liquidationLtvBps: string;
  allowed: boolean;
};

type ExecuteWithdrawResponse = {
  txHash: `0x${string}`;
  backendSignature: `0x${string}`;
  status: "success" | "reverted";
  blockNumber: string;
  withdrawAmount: string;
  to: `0x${string}`;
  borrowerWallet: `0x${string}`;
};

type RepayExecutionResult = {
  txHash: `0x${string}`;
  status: "success" | "reverted";
  blockNumber: string;
  borrowerWallet: `0x${string}`;
  repayAmount: string;
};

type WorkflowTab = "home" | "deposit" | "position" | "repay" | "allPositions";
type PositionSnapshot = {
  borrowerWallet: `0x${string}`;
  collateral: string;
  debt: string;
  exists: boolean;
  currentLtvBps: string;
  liquidationLtvBps: string;
  availableBorrow: string;
};
type EditableSplitDraft = {
  id: string;
  percent: string;
  amount: string;
};
type SplitDraftPreview = {
  amount: bigint;
  percentageLabel: string;
  valid: boolean;
};
type OwnerPolicyResponse = {
  owner: `0x${string}`;
  policyName: string;
  maxLtvBps: string;
  collateralRatioBps: string;
  liquidationLtvBps: string;
};

type AllPositionRecord = {
  owner: `0x${string}`;
  borrowerWallet: `0x${string}`;
  collateral: string;
  debt: string;
  currentLtvBps: string;
  liquidationLtvBps: string;
  createdAt: string;
  updatedAt: string;
};

type PersistedSplitWallet = {
  address: `0x${string}`;
  privateKey: `0x${string}`;
  percentage: number;
  collateralAmount: string;
};

type PreparedSplitPlan = {
  wallets: `0x${string}`[];
  amounts: string[];
  totalCollateral: string;
  expiresAt: string;
  nonce: `0x${string}`;
  signature: `0x${string}`;
};

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";
const publicClient = createPublicClient({
  transport: http(rpcUrl)
});
const splitWalletStorageKey = "karma-generated-split-wallets";
const addedWalletStorageKey = "karma-added-split-wallets";

export function LoanFlowCard() {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();

  const [borrowAmount, setBorrowAmount] = useState("0");
  const [editableSplitDrafts, setEditableSplitDrafts] = useState<EditableSplitDraft[]>([]);
  const [ownerAddress, setOwnerAddress] = useState<`0x${string}` | null>(null);
  const [activePlanOwner, setActivePlanOwner] = useState<`0x${string}` | null>(null);
  const [ownerPolicy, setOwnerPolicy] = useState<OwnerPolicyResponse | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [collateralApproved, setCollateralApproved] = useState(false);
  const [collateralDeposited, setCollateralDeposited] = useState(false);
  const [splitWallets, setSplitWallets] = useState<SplitWallet[]>([]);
  const [splitPlanSignature, setSplitPlanSignature] = useState<`0x${string}` | null>(null);
  const [preparedSplitPlan, setPreparedSplitPlan] = useState<PreparedSplitPlan | null>(null);
  const [splitPlanId, setSplitPlanId] = useState<string | null>(null);
  const [allocationTxHash, setAllocationTxHash] = useState<`0x${string}` | null>(null);
  const [activeTab, setActiveTab] = useState<WorkflowTab>("home");
  const [depositStep, setDepositStep] = useState(0);
  const [actionBorrowerWallet, setActionBorrowerWallet] = useState("");
  const [repayAmount, setRepayAmount] = useState("10");
  const [debtApproved, setDebtApproved] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("5");
  const [withdrawRecipient, setWithdrawRecipient] = useState("");
  const [borrowPreview, setBorrowPreview] = useState<BorrowPreviewResponse | null>(null);
  const [borrowExecution, setBorrowExecution] = useState<ExecuteBorrowResponse | null>(null);
  const [repayExecution, setRepayExecution] = useState<RepayExecutionResult | null>(null);
  const [withdrawPreview, setWithdrawPreview] = useState<WithdrawPreviewResponse | null>(null);
  const [withdrawExecution, setWithdrawExecution] = useState<ExecuteWithdrawResponse | null>(null);
  const [borrowNotice, setBorrowNotice] = useState<string | null>(null);
  const [withdrawNotice, setWithdrawNotice] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showWalletInfoModal, setShowWalletInfoModal] = useState(false);
  const [showAddAccountGuideModal, setShowAddAccountGuideModal] = useState(false);
  const [addedSplitWallets, setAddedSplitWallets] = useState<`0x${string}`[]>([]);
  const [positionSnapshots, setPositionSnapshots] = useState<Record<string, PositionSnapshot>>({});
  const [positionCreatedAts, setPositionCreatedAts] = useState<Record<string, string>>({});
  const [positionUpdatedAts, setPositionUpdatedAts] = useState<Record<string, string>>({});
  const [allPositionRecords, setAllPositionRecords] = useState<AllPositionRecord[]>([]);
  const [homePositionRecords, setHomePositionRecords] = useState<AllPositionRecord[]>([]);
  const [positionsRefreshKey, setPositionsRefreshKey] = useState(0);
  const [dbSplitWallets, setDbSplitWallets] = useState<`0x${string}`[]>([]);
  const [depositStatuses, setDepositStatuses] = useState({
    connect: "대기 중",
    quote: "대기 중",
    approve: "대기 중",
    deposit: "대기 중",
    wallets: "대기 중",
    split: "대기 중"
  });
  const [positionStatuses, setPositionStatuses] = useState({
    borrowPreview: "대기 중",
    borrow: "대기 중",
  });
  const [repayStatuses, setRepayStatuses] = useState({
    debtApprove: "대기 중",
    repay: "대기 중",
    withdrawPreview: "대기 중",
    withdraw: "대기 중"
  });

  function parseEtherInput(value: string) {
    try {
      return parseEther(value);
    } catch {
      return 0n;
    }
  }

  function clampRepayAmountInput(value: string) {
    if (!selectedPosition) {
      return value;
    }

    try {
      const requested = parseEther(value);
      const maxDebt = BigInt(selectedPosition.debt);
      if (requested > maxDebt) {
        return formatEther(maxDebt);
      }

      return value;
    } catch {
      return value;
    }
  }

  function clampBorrowAmountInput(value: string) {
    try {
      const requested = parseEther(value);
      if (requested > currentAvailableBorrow) {
        setBorrowNotice(`최대 ${formatEther(currentAvailableBorrow)} sDAI까지 대출할 수 있습니다.`);
        return formatEther(currentAvailableBorrow);
      }

      setBorrowNotice(null);
      return value;
    } catch {
      setBorrowNotice(null);
      return value;
    }
  }

  function calculateMaxWithdrawAmount() {
    if (!selectedPosition) {
      return 0n;
    }

    const collateral = BigInt(selectedPosition.collateral);
    const debt = BigInt(selectedPosition.debt);
    const liquidationLtv = BigInt(selectedPosition.liquidationLtvBps);

    if (debt === 0n) {
      return collateral;
    }

    const minimumCollateralToStaySafe =
      liquidationLtv > 0n ? (debt * 10000n + liquidationLtv - 1n) / liquidationLtv : collateral;

    return collateral > minimumCollateralToStaySafe ? collateral - minimumCollateralToStaySafe : 0n;
  }

  function clampWithdrawAmountInput(value: string) {
    const maxWithdrawAmount = calculateMaxWithdrawAmount();
    const withdrawInputCap = maxWithdrawAmount > parseEther("0.01")
      ? maxWithdrawAmount - parseEther("0.01")
      : 0n;

    try {
      const requested = parseEther(value);
      if (requested > withdrawInputCap) {
        setWithdrawNotice(`최대 ${formatEther(maxWithdrawAmount)} ETH까지 출금할 수 있습니다.`);
        return formatEther(withdrawInputCap);
      }

      setWithdrawNotice(null);
      return value;
    } catch {
      setWithdrawNotice(null);
      return value;
    }
  }

  function formatCreatedAtLabel(value?: string) {
    if (!value) return null;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return date.toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }

  function formatPercentLabel(amount: bigint, total: bigint) {
    if (total === 0n) return "0.00";
    const scaled = (amount * 10000n) / total;
    const integer = scaled / 100n;
    const decimal = (scaled % 100n).toString().padStart(2, "0");
    return `${integer.toString()}.${decimal}`;
  }

  function syncAmountFromPercent(percentValue: string, totalCollateral: bigint) {
    const percent = Number(percentValue);
    if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) {
      return "";
    }

    const amount = (totalCollateral * BigInt(Math.floor(percent * 100))) / 10000n;
    return formatEther(amount);
  }

  function syncPercentFromAmount(amountValue: string, totalCollateral: bigint) {
    try {
      const amount = parseEther(amountValue);
      if (amount <= 0n || totalCollateral === 0n) {
        return "";
      }

      return formatPercentLabel(amount, totalCollateral);
    } catch {
      return "";
    }
  }

  function buildSplitDraftPreviews() {
    if (!quote) {
      return {
        previews: [] as SplitDraftPreview[],
        valid: false
      };
    }

    const totalCollateral = BigInt(quote.collateralRequired);
    const previews: SplitDraftPreview[] = [];
    let allocated = 0n;
    let valid = totalCollateral > 0n;

    for (const draft of editableSplitDrafts) {
      let amount = 0n;

      if (!draft.amount.trim()) {
        valid = false;
      } else {
        try {
          amount = parseEther(draft.amount);
          if (amount <= 0n) {
            valid = false;
          }
        } catch {
          valid = false;
        }
      }

      allocated += amount;
      previews.push({
        amount,
        percentageLabel: formatPercentLabel(amount, totalCollateral),
        valid
      });
    }

    const remaining = totalCollateral - allocated;
    if (remaining <= 0n) {
      valid = false;
    }

    previews.push({
      amount: remaining > 0n ? remaining : 0n,
      percentageLabel: formatPercentLabel(remaining > 0n ? remaining : 0n, totalCollateral),
      valid: remaining > 0n
    });

    return {
      previews,
      valid
    };
  }

  const splitDraft = buildSplitDraftPreviews();
  const splitConfigValid = splitDraft.valid;
  const depositFlowComplete = dbSplitWallets.length > 0;
  const selectedPosition = actionBorrowerWallet ? positionSnapshots[actionBorrowerWallet] : undefined;
  const selectedGeneratedWallet =
    splitWallets.find((wallet) => wallet.address.toLowerCase() === actionBorrowerWallet.toLowerCase()) ?? null;
  const isSelectedWalletAdded =
    Boolean(actionBorrowerWallet) &&
    addedSplitWallets.some((wallet) => wallet.toLowerCase() === actionBorrowerWallet.toLowerCase());
  const allSplitWalletsAdded =
    splitWallets.length > 0 &&
    splitWallets.every((wallet) =>
      addedSplitWallets.some((savedWallet) => savedWallet.toLowerCase() === wallet.address.toLowerCase())
    );
  const maskedPrivateKey = selectedGeneratedWallet
    ? `${selectedGeneratedWallet.privateKey.slice(0, 6)}${"*".repeat(
        Math.max(selectedGeneratedWallet.privateKey.length - 10, 8)
      )}${selectedGeneratedWallet.privateKey.slice(-4)}`
    : `${"*".repeat(24)}`;
  const connectedWalletIsBorrower =
    Boolean(address) &&
    dbSplitWallets.some((wallet) => wallet.toLowerCase() === address!.toLowerCase());
  const allPositionWallets = allPositionRecords.map((record) => record.borrowerWallet);
  const trackedPositionWallets = Array.from(new Set([...dbSplitWallets, ...allPositionWallets]));
  const trackedPositionWalletsKey = trackedPositionWallets.join(":");
  const homeTotalCollateral = homePositionRecords.reduce(
    (sum, record) => sum + BigInt(positionSnapshots[record.borrowerWallet]?.collateral ?? record.collateral),
    0n
  );
  const homeTotalDebt = homePositionRecords.reduce(
    (sum, record) => sum + BigInt(positionSnapshots[record.borrowerWallet]?.debt ?? record.debt),
    0n
  );
  const sortedHomePositionRecords = [...homePositionRecords].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
  const canonicalBorrowerWalletOrder =
    sortedHomePositionRecords.length > 0
      ? sortedHomePositionRecords.map((record) => record.borrowerWallet)
      : dbSplitWallets;
  const getBorrowerIndex = (wallet: string) =>
    canonicalBorrowerWalletOrder.findIndex(
      (candidate) => candidate.toLowerCase() === wallet.toLowerCase()
    );
  const selectedBorrowerIndex = actionBorrowerWallet ? getBorrowerIndex(actionBorrowerWallet) : -1;
  const sortedPositionWallets = [...dbSplitWallets].sort((leftWallet, rightWallet) => {
    const leftSnapshot = positionSnapshots[leftWallet];
    const rightSnapshot = positionSnapshots[rightWallet];
    const leftLtv = leftSnapshot ? BigInt(leftSnapshot.currentLtvBps) : -1n;
    const rightLtv = rightSnapshot ? BigInt(rightSnapshot.currentLtvBps) : -1n;

    if (leftLtv === rightLtv) {
      return dbSplitWallets.indexOf(leftWallet) - dbSplitWallets.indexOf(rightWallet);
    }

    return leftLtv > rightLtv ? -1 : 1;
  });
  const depositOwnerMatches =
    Boolean(address) &&
    Boolean(ownerAddress) &&
    address!.toLowerCase() === ownerAddress!.toLowerCase();
  const depositOwnerLocked = Boolean(ownerAddress) && !depositOwnerMatches;
  const depositBorrowerLocked = Boolean(connectedWalletIsBorrower);
  const effectiveRequestOwner = activePlanOwner ?? ownerAddress ?? address ?? null;
  const requestedBorrowAmount = parseEtherInput(borrowAmount);
  const currentDebt = selectedPosition ? BigInt(selectedPosition.debt) : 0n;
  const currentCollateral = selectedPosition ? BigInt(selectedPosition.collateral) : 0n;
  const currentAvailableBorrow = selectedPosition ? BigInt(selectedPosition.availableBorrow) : 0n;
  const currentBorrowLimit =
    currentCollateral > 0n
      ? (currentCollateral * BigInt(ownerPolicy?.maxLtvBps ?? "6667")) / 10000n
      : 0n;
  const currentAvailableWithdraw = calculateMaxWithdrawAmount();
  const requestedQuoteAmount = parseEtherInput(borrowAmount);
  const borrowExceedsCapacity = requestedBorrowAmount > currentAvailableBorrow;
  const resultingDebt = currentDebt + requestedBorrowAmount;
  const resultingLtvBps =
    currentCollateral === 0n || resultingDebt === 0n ? 0n : (resultingDebt * 10000n) / currentCollateral;
  const liquidationThresholdBps = BigInt(
    ownerPolicy?.liquidationLtvBps ?? selectedPosition?.liquidationLtvBps ?? "0"
  );
  const nearLiquidation =
    borrowPreview &&
    liquidationThresholdBps >= resultingLtvBps &&
    liquidationThresholdBps - resultingLtvBps <= 50n;
  const withdrawNearLiquidation =
    withdrawPreview &&
    BigInt(withdrawPreview.liquidationLtvBps) >= BigInt(withdrawPreview.resultingLtvBps) &&
    BigInt(withdrawPreview.liquidationLtvBps) - BigInt(withdrawPreview.resultingLtvBps) <= 50n;
  const remainingBorrowAfterRequest =
    currentAvailableBorrow > requestedBorrowAmount ? currentAvailableBorrow - requestedBorrowAmount : 0n;
  const workflowStep = !address
    ? "오너 연결"
    : !ownerPolicy
      ? "오너 카르마 혜택 조회"
      : !quote
      ? "견적 요청"
      : splitWallets.length === 0
        ? "B 지갑 생성"
        : !splitPlanSignature
          ? "분할 계획 승인"
          : !collateralDeposited
            ? "B 지갑 연결 및 담보 예치"
            : !allocationTxHash
              ? "담보 배정"
            : "대출";
  const depositStepMeta = [
    {
      title: "1단계. 오너 카르마 혜택 조회",
      status: ownerPolicy ? "완료" : address ? "조회 대기" : "지갑 연결 필요"
    },
    { title: "2단계. 견적 요청", status: depositStatuses.quote },
    {
      title: "3단계. B 지갑 생성",
      status: depositStatuses.wallets
    },
    { title: "4단계. 분할 계획 승인", status: depositStatuses.split },
    { title: "5단계. B 지갑 연결", status: allSplitWalletsAdded ? "완료" : "연결 확인 필요" },
    {
      title: "6단계. 담보 예치 및 배정",
      status: allocationTxHash ? "완료" : collateralDeposited ? "배정 대기" : collateralApproved ? "예치 대기" : depositStatuses.approve
    }
  ];
  const completedDepositSteps = depositStepMeta.filter((step) => step.status === "완료").length;
  const depositProgressPercent = (completedDepositSteps / depositStepMeta.length) * 100;

  function canAdvanceDepositStep(step: number) {
    switch (step) {
      case 0:
        return Boolean(ownerPolicy);
      case 1:
        return Boolean(quote);
      case 2:
        return splitWallets.length > 0;
      case 3:
        return Boolean(splitPlanSignature);
      case 4:
        return allSplitWalletsAdded && depositOwnerMatches;
      case 5:
        return Boolean(allocationTxHash);
      default:
        return false;
    }
  }

  useEffect(() => {
    setDepositStatuses((prev) => ({
      ...prev,
      connect: address ? "완료" : "대기 중"
    }));
  }, [address]);

  useEffect(() => {
    setOwnerPolicy(null);
    setQuote(null);
    setSplitWallets([]);
    setSplitPlanSignature(null);
    setSplitPlanId(null);
    setAllocationTxHash(null);
    setEditableSplitDrafts([]);
    setCollateralApproved(false);
    setCollateralDeposited(false);
    setDepositStatuses({
      connect: address ? "완료" : "대기 중",
      quote: "대기 중",
      approve: "대기 중",
      deposit: "대기 중",
      wallets: "대기 중",
      split: "대기 중"
    });
    setDepositStep(0);
  }, [address]);

  useEffect(() => {
    if (!quote) return;

    const totalCollateral = BigInt(quote.collateralRequired);
    setEditableSplitDrafts((prev) =>
      prev.map((draft) => ({
        ...draft,
        amount:
          draft.amount || draft.percent
            ? syncAmountFromPercent(draft.percent, totalCollateral) || draft.amount
            : draft.amount
      }))
    );
  }, [quote]);

  useEffect(() => {
    setDebtApproved(false);
    setRepayStatuses((prev) => ({ ...prev, debtApprove: "대기 중" }));
  }, [repayAmount]);

  useEffect(() => {
    if (!toastMessage) return;

    const timeout = window.setTimeout(() => {
      setToastMessage(null);
    }, 2200);

    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    if (splitWallets.length === 0 || !allSplitWalletsAdded) {
      return;
    }

    setToastMessage("모든 지갑이 연결되었습니다.");
  }, [allSplitWalletsAdded, splitWallets.length]);

  useEffect(() => {
    let cancelled = false;

    async function loadAllPositions() {
      try {
        const response = await fetch(`${backendUrl}/delegations/positions`);
        if (!response.ok) {
          if (!cancelled) {
            setAllPositionRecords([]);
          }
          return;
        }

        const data = (await response.json()) as AllPositionRecord[];
        if (!cancelled) {
          setAllPositionRecords(data);
        }
      } catch {
        if (!cancelled) {
          setAllPositionRecords([]);
        }
      }
    }

    void loadAllPositions();

    return () => {
      cancelled = true;
    };
  }, [positionsRefreshKey]);

  useEffect(() => {
    if (!effectiveRequestOwner) {
      setHomePositionRecords([]);
      return;
    }

    let cancelled = false;

    async function loadHomePositions() {
      try {
        const response = await fetch(
          `${backendUrl}/delegations/positions?owner=${effectiveRequestOwner}`
        );
        if (!response.ok) {
          if (!cancelled) {
            setHomePositionRecords([]);
          }
          return;
        }

        const data = (await response.json()) as AllPositionRecord[];
        if (!cancelled) {
          setHomePositionRecords(data);
        }
      } catch {
        if (!cancelled) {
          setHomePositionRecords([]);
        }
      }
    }

    void loadHomePositions();

    return () => {
      cancelled = true;
    };
  }, [effectiveRequestOwner, positionsRefreshKey]);

  useEffect(() => {
    if (!address) {
      setDbSplitWallets([]);
      setPositionCreatedAts({});
      setPositionUpdatedAts({});
      setActivePlanOwner(null);
      return;
    }

    let cancelled = false;

    async function loadActiveSplitPlan() {
      try {
        let response = await fetch(`${backendUrl}/delegations/split-plans/active?owner=${address}`);
        let activePlanOwner = address;

        if (!response.ok) {
          const ownerLookupResponse = await fetch(
            `${backendUrl}/delegations/owners/latest?borrowerWallet=${address}`
          );

          if (!ownerLookupResponse.ok) {
            if (!cancelled) {
              setDbSplitWallets([]);
              setPositionCreatedAts({});
              setPositionUpdatedAts({});
            }
            return;
          }

          const ownerLookup = (await ownerLookupResponse.json()) as LatestOwnerResponse;
          activePlanOwner = ownerLookup.owner;
          response = await fetch(
            `${backendUrl}/delegations/split-plans/active?owner=${activePlanOwner}`
          );

          if (!response.ok) {
            if (!cancelled) {
              setDbSplitWallets([]);
              setPositionCreatedAts({});
              setPositionUpdatedAts({});
            }
            return;
          }
        }

        const data = (await response.json()) as ActiveSplitPlanResponse;
        if (!cancelled) {
          setActivePlanOwner(data.owner);
          setDbSplitWallets(data.wallets);
          setPositionCreatedAts(
            Object.fromEntries(
              data.wallets.map((wallet, index) => [wallet, data.createdAts?.[index] ?? ""])
            )
          );
          setPositionUpdatedAts(
            Object.fromEntries(
              data.wallets.map((wallet, index) => [wallet, data.updatedAts?.[index] ?? ""])
            )
          );
          setActionBorrowerWallet((current) => {
            if (current && data.wallets.some((wallet) => wallet.toLowerCase() === current.toLowerCase())) {
              return current;
            }

            if (address && data.wallets.some((wallet) => wallet.toLowerCase() === address.toLowerCase())) {
              return address;
            }

            return data.wallets[0] ?? "";
          });
        }
      } catch {
        if (!cancelled) {
          setDbSplitWallets([]);
          setPositionCreatedAts({});
          setPositionUpdatedAts({});
          setActivePlanOwner(null);
        }
      }
    }

    void loadActiveSplitPlan();

    return () => {
      cancelled = true;
    };
  }, [address, allocationTxHash, splitPlanId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const stored = window.localStorage.getItem(splitWalletStorageKey);
      if (!stored) {
        return;
      }

      const parsed = JSON.parse(stored) as PersistedSplitWallet[];
      if (!Array.isArray(parsed)) {
        return;
      }

      setSplitWallets(
        parsed.map((wallet) => ({
          address: wallet.address,
          privateKey: wallet.privateKey,
          percentage: wallet.percentage,
          collateralAmount: BigInt(wallet.collateralAmount)
        }))
      );
    } catch {
      window.localStorage.removeItem(splitWalletStorageKey);
    }

    try {
      const storedAddedWallets = window.localStorage.getItem(addedWalletStorageKey);
      if (!storedAddedWallets) {
        return;
      }

      const parsedAddedWallets = JSON.parse(storedAddedWallets) as `0x${string}`[];
      if (!Array.isArray(parsedAddedWallets)) {
        return;
      }

      setAddedSplitWallets(parsedAddedWallets);
    } catch {
      window.localStorage.removeItem(addedWalletStorageKey);
    }

  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (splitWallets.length === 0) {
      window.localStorage.removeItem(splitWalletStorageKey);
      return;
    }

    const persistedWallets: PersistedSplitWallet[] = splitWallets.map((wallet) => ({
      address: wallet.address,
      privateKey: wallet.privateKey,
      percentage: wallet.percentage,
      collateralAmount: wallet.collateralAmount.toString()
    }));

    window.localStorage.setItem(splitWalletStorageKey, JSON.stringify(persistedWallets));
  }, [splitWallets]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (addedSplitWallets.length === 0) {
      window.localStorage.removeItem(addedWalletStorageKey);
      return;
    }

    window.localStorage.setItem(addedWalletStorageKey, JSON.stringify(addedSplitWallets));
  }, [addedSplitWallets]);

  async function refreshPositions() {
    if (trackedPositionWallets.length === 0) {
      setPositionSnapshots({});
      return;
    }

    const liquidationLtvBps = await publicClient.readContract({
      address: lendingAddress,
      abi: lendingAbi,
      functionName: "liquidationLtvBps"
    });

    const entries = await Promise.all(
      trackedPositionWallets.map(async (borrowerWallet) => {
        const [collateral, debt, exists] = await publicClient.readContract({
          address: lendingAddress,
          abi: lendingAbi,
          functionName: "positions",
          args: [borrowerWallet]
        });
        const currentLtvBps = await publicClient.readContract({
          address: lendingAddress,
          abi: lendingAbi,
          functionName: "currentLtvBps",
          args: [borrowerWallet]
        });
        const policyLtvBps = BigInt(ownerPolicy?.maxLtvBps ?? "6667");
        const maxBorrowAtLiquidation = (collateral * policyLtvBps) / 10_000n;
        const availableBorrow =
          maxBorrowAtLiquidation > debt ? maxBorrowAtLiquidation - debt : 0n;

        return [
          borrowerWallet,
          {
            borrowerWallet,
            collateral: collateral.toString(),
            debt: debt.toString(),
            exists,
            currentLtvBps: currentLtvBps.toString(),
            liquidationLtvBps: liquidationLtvBps.toString(),
            availableBorrow: availableBorrow.toString()
          }
        ] as const;
      })
    );

    setPositionSnapshots(Object.fromEntries(entries));
  }

  useEffect(() => {
    if (trackedPositionWalletsKey.length === 0) {
      setPositionSnapshots({});
      return;
    }

    let cancelled = false;

    async function loadPositions() {
      if (!cancelled) {
        await refreshPositions();
      }
    }

    void loadPositions();

    return () => {
      cancelled = true;
    };
  }, [trackedPositionWalletsKey, ownerPolicy, positionsRefreshKey]);

  async function fetchOwnerPolicy() {
    if (!address) return;

    const response = await fetch(`${backendUrl}/loans/policy?owner=${address}`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Failed to fetch owner policy");
    }

    const data = (await response.json()) as OwnerPolicyResponse;
    setOwnerPolicy(data);
  }

  async function openWalletChooser() {
    if (typeof window === "undefined") return;

    const ethereum = (window as Window & {
      ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
    }).ethereum;

    if (!ethereum) return;

    try {
      await ethereum.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }]
      });
    } catch {
      // Fall through to direct account request for wallets that do not support the permissions RPC.
    }

    await ethereum.request({
      method: "eth_requestAccounts"
    });
  }

  async function copyBorrowerWallet() {
    if (!actionBorrowerWallet || typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(actionBorrowerWallet);
  }

  async function copySelectedBorrowerPrivateKey() {
    if (!selectedGeneratedWallet || typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(selectedGeneratedWallet.privateKey);
    setToastMessage("B 지갑 private key를 복사했습니다.");
  }

  function markSelectedWalletAdded() {
    if (!actionBorrowerWallet) return;

    setAddedSplitWallets((prev) => {
      if (prev.some((wallet) => wallet.toLowerCase() === actionBorrowerWallet.toLowerCase())) {
        return prev;
      }

      return [...prev, actionBorrowerWallet as `0x${string}`];
    });
    setShowAddAccountGuideModal(false);
    setToastMessage("B 지갑 상태를 연결로 표시했습니다.");
  }

  async function requestQuote() {
    if (!address || !ownerPolicy) return;
    if (requestedQuoteAmount <= 0n) {
      setDepositStatuses((prev) => ({ ...prev, quote: "입력 확인 필요" }));
      setToastMessage("희망 대출 금액은 0보다 커야 합니다.");
      return;
    }

    setDepositStatuses((prev) => ({ ...prev, quote: "진행 중..." }));

    const response = await fetch(`${backendUrl}/loans/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner: address,
        requestedBorrowAmount: requestedQuoteAmount.toString()
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      setDepositStatuses((prev) => ({ ...prev, quote: "실패" }));
      throw new Error(errorText || "Failed to request quote");
    }

    const data = (await response.json()) as QuoteResponse;
    setOwnerAddress(address);
    setCollateralApproved(false);
    setCollateralDeposited(false);
    setSplitWallets([]);
    setEditableSplitDrafts([]);
    setSplitPlanSignature(null);
    setPreparedSplitPlan(null);
    setSplitPlanId(null);
    setAllocationTxHash(null);
    setDepositStatuses({
      connect: address ? "완료" : "대기 중",
      quote: "완료",
      approve: "대기 중",
      deposit: "대기 중",
      wallets: "대기 중",
      split: "대기 중"
    });
    setDepositStep(1);
    startTransition(() => setQuote(data));
  }

  async function approveCollateral() {
    if (!quote) return;

    setDepositStatuses((prev) => ({ ...prev, approve: "진행 중..." }));

    await writeContractAsync({
      address: collateralAddress,
      abi: collateralAbi,
      functionName: "approve",
      args: [lendingAddress, BigInt(quote.collateralRequired)]
    });
    setCollateralApproved(true);
    setDepositStatuses((prev) => ({ ...prev, approve: "완료" }));
  }

  async function submitPreparedSplitPlan() {
    if (!address || !preparedSplitPlan) return null;

    const response = await fetch(`${backendUrl}/delegations/split-plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner: address,
        wallets: preparedSplitPlan.wallets,
        amounts: preparedSplitPlan.amounts,
        totalCollateral: preparedSplitPlan.totalCollateral,
        expiresAt: preparedSplitPlan.expiresAt,
        nonce: preparedSplitPlan.nonce,
        signature: preparedSplitPlan.signature
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Failed to store split plan");
    }

    return (await response.json()) as SplitPlanResponse;
  }

  async function depositCollateral() {
    if (!quote || !preparedSplitPlan) return;

    setDepositStatuses((prev) => ({ ...prev, deposit: "진행 중..." }));

    const txHash = await writeContractAsync({
      address: lendingAddress,
      abi: lendingAbi,
      functionName: "depositOwnerCollateral",
      args: [BigInt(quote.collateralRequired)]
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      setDepositStatuses((prev) => ({ ...prev, deposit: "실패" }));
      throw new Error("담보 예치 트랜잭션이 블록에서 되돌려졌습니다.");
    }

    setCollateralDeposited(true);
    setDepositStatuses((prev) => ({ ...prev, deposit: "완료" }));
    const data = await submitPreparedSplitPlan();
    if (data) {
      setSplitPlanId(data.splitPlanId);
      setAllocationTxHash(data.allocationTxHash);
    }
    setToastMessage(
      `${formatEther(BigInt(quote.collateralRequired))} ETH 예치가 완료되었습니다.`
    );
  }

  function startNewDepositFlow() {
    setActiveTab("deposit");
    setBorrowAmount("0");
    setQuote(null);
    setEditableSplitDrafts([]);
    setSplitWallets([]);
    setAddedSplitWallets([]);
    setCollateralApproved(false);
    setCollateralDeposited(false);
    setSplitPlanSignature(null);
    setPreparedSplitPlan(null);
    setSplitPlanId(null);
    setAllocationTxHash(null);
    setDepositStatuses({
      connect: address ? "완료" : "대기 중",
      quote: "대기 중",
      approve: "대기 중",
      deposit: "대기 중",
      wallets: "대기 중",
      split: "대기 중"
    });
    setDepositStep(ownerPolicy ? 1 : 0);
  }

  function generateSplitWallets() {
    if (!quote || !splitConfigValid) {
      return;
    }

    const nextWallets = splitDraft.previews.map((draft) => {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);

      return {
        address: account.address,
        privateKey,
        percentage: Number(draft.percentageLabel),
        collateralAmount: draft.amount
      };
    });

    setSplitWallets(nextWallets);
    setAddedSplitWallets([]);
    setSplitPlanSignature(null);
    setPreparedSplitPlan(null);
    setSplitPlanId(null);
    setAllocationTxHash(null);
    setActionBorrowerWallet(nextWallets[0]?.address ?? "");
    setDepositStatuses((prev) => ({ ...prev, wallets: "완료" }));
    setToastMessage("분할 지갑 생성이 완료되었습니다.");
  }

  function addSplitDraftCard() {
    invalidateGeneratedSplitWallets();
    setEditableSplitDrafts((prev) => [
      ...prev,
      { id: `draft-${Date.now()}-${prev.length}`, percent: "", amount: "" }
    ]);
  }

  function invalidateGeneratedSplitWallets() {
    setSplitWallets([]);
    setSplitPlanSignature(null);
    setPreparedSplitPlan(null);
    setSplitPlanId(null);
    setAllocationTxHash(null);
    setDepositStatuses((prev) => ({
      ...prev,
      wallets: "대기 중",
      split: "대기 중"
    }));
  }

  function updateSplitPercent(id: string, percent: string) {
    invalidateGeneratedSplitWallets();
    setEditableSplitDrafts((prev) => {
      if (!quote) {
        return prev.map((draft) => (draft.id === id ? { ...draft, percent } : draft));
      }

      const totalCollateral = BigInt(quote.collateralRequired);
      return prev.map((draft) =>
        draft.id === id
          ? {
              ...draft,
              percent,
              amount: syncAmountFromPercent(percent, totalCollateral)
            }
          : draft
      );
    });
  }

  function updateSplitAmount(id: string, amount: string) {
    invalidateGeneratedSplitWallets();
    setEditableSplitDrafts((prev) => {
      if (!quote) {
        return prev.map((draft) => (draft.id === id ? { ...draft, amount } : draft));
      }

      const totalCollateral = BigInt(quote.collateralRequired);
      return prev.map((draft) =>
        draft.id === id
          ? {
              ...draft,
              amount,
              percent: syncPercentFromAmount(amount, totalCollateral)
            }
          : draft
      );
    });
  }

  function removeSplitDraftCard(id: string) {
    invalidateGeneratedSplitWallets();
    setEditableSplitDrafts((prev) => prev.filter((draft) => draft.id !== id));
  }

  async function signSplitPlan() {
    if (!address || !quote || splitWallets.length === 0 || !splitConfigValid) return;
    setDepositStatuses((prev) => ({ ...prev, split: "진행 중..." }));

    const nonce = keccak256(
      stringToHex(
        `${address}:${splitWallets.map((wallet) => wallet.address).join(":")}:${Date.now()}`
      )
    );
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 60 * 30);
    const wallets = splitWallets.map((wallet) => wallet.address);
    const amounts = splitWallets.map((wallet) => wallet.collateralAmount);

    const signature = await signTypedDataAsync({
      domain: {
        name: "KarmaLendingSplitPlan",
        version: "1",
        chainId,
        verifyingContract: lendingAddress
      },
      primaryType: "SplitPlan",
      types: {
        SplitPlan: [
          { name: "owner", type: "address" },
          { name: "wallets", type: "address[]" },
          { name: "amounts", type: "uint256[]" },
          { name: "totalCollateral", type: "uint256" },
          { name: "expiresAt", type: "uint256" },
          { name: "nonce", type: "bytes32" }
        ]
      },
      message: {
        owner: address,
        wallets,
        amounts,
        totalCollateral: BigInt(quote.collateralRequired),
        expiresAt,
        nonce
      }
    });
    setSplitPlanSignature(signature);
    setPreparedSplitPlan({
      wallets,
      amounts: amounts.map((amount) => amount.toString()),
      totalCollateral: quote.collateralRequired,
      expiresAt: expiresAt.toString(),
      nonce,
      signature
    });
    setDepositStatuses((prev) => ({ ...prev, split: "완료" }));
    setActionBorrowerWallet((current) => current || wallets[0] || "");
    setToastMessage("분할 계획 승인이 완료되었습니다.");
  }

  async function previewBorrow() {
    if (!effectiveRequestOwner || !actionBorrowerWallet) return;

    setPositionStatuses((prev) => ({ ...prev, borrowPreview: "진행 중..." }));
    setBorrowNotice(null);

    const [latestCollateral, latestDebt] = await publicClient.readContract({
      address: lendingAddress,
      abi: lendingAbi,
      functionName: "positions",
      args: [actionBorrowerWallet as `0x${string}`]
    });
    const effectivePolicyLtvBps = BigInt(ownerPolicy?.maxLtvBps ?? "6667");
    const latestMaxBorrowByCollateral = (latestCollateral * effectivePolicyLtvBps) / 10000n;
    const latestAvailableBorrow =
      latestMaxBorrowByCollateral > latestDebt ? latestMaxBorrowByCollateral - latestDebt : 0n;

    const requestedAmount = parseEtherInput(borrowAmount);
    const borrowAmountToPreview =
      latestAvailableBorrow > 0n && requestedAmount > latestAvailableBorrow
        ? latestAvailableBorrow
        : requestedAmount;

    if (borrowAmountToPreview <= 0n) {
      setPositionStatuses((prev) => ({ ...prev, borrowPreview: "대기 중" }));
      setBorrowNotice("대출 가능한 금액이 없습니다.");
      return;
    }

    if (borrowAmountToPreview !== requestedAmount) {
      setBorrowAmount(formatEther(borrowAmountToPreview));
    }

    const response = await fetch(`${backendUrl}/loans/borrow-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner: effectiveRequestOwner,
        borrowerWallet: actionBorrowerWallet,
        borrowAmount: borrowAmountToPreview.toString()
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Failed to preview borrow");
    }

    const data = (await response.json()) as BorrowPreviewResponse;
    setBorrowPreview(data);
    setBorrowExecution(null);
    setPositionStatuses((prev) => ({ ...prev, borrowPreview: "완료" }));
  }

  async function executeBorrow() {
    if (!effectiveRequestOwner || !borrowPreview) return;

    setPositionStatuses((prev) => ({ ...prev, borrow: "진행 중..." }));

    const response = await fetch(`${backendUrl}/loans/borrow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner: effectiveRequestOwner,
        borrowerWallet: borrowPreview.borrowerWallet,
        borrowAmount: requestedBorrowAmount.toString(),
        receiver: borrowPreview.receiver
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Failed to execute borrow");
    }

    const data = (await response.json()) as ExecuteBorrowResponse;
    setBorrowExecution(data);
    setPositionStatuses((prev) => ({ ...prev, borrow: "완료" }));
    await refreshPositions();
    setPositionsRefreshKey((prev) => prev + 1);
  }

  async function approveDebtToken() {
    const repayAmountWei = parseEtherInput(repayAmount);
    if (repayAmountWei <= 0n) return;

    setRepayStatuses((prev) => ({ ...prev, debtApprove: "진행 중..." }));

    await writeContractAsync({
      address: debtAddress,
      abi: debtAbi,
      functionName: "approve",
      args: [lendingAddress, repayAmountWei]
    });
    setDebtApproved(true);
    setRepayStatuses((prev) => ({ ...prev, debtApprove: "완료" }));
  }

  async function repayDebt() {
    if (!actionBorrowerWallet) return;
    if (!selectedPosition) return;

    const requestedRepayAmount = parseEtherInput(repayAmount);
    if (requestedRepayAmount <= 0n) return;

    const currentDebtAmount = BigInt(selectedPosition.debt);
    const actualRepayAmount =
      requestedRepayAmount > currentDebtAmount ? currentDebtAmount : requestedRepayAmount;
    if (actualRepayAmount <= 0n) return;

    setRepayStatuses((prev) => ({ ...prev, repay: "진행 중..." }));
    setRepayExecution(null);

    const txHash = await writeContractAsync({
      address: lendingAddress,
      abi: lendingAbi,
      functionName: "repay",
      args: [actionBorrowerWallet as `0x${string}`, actualRepayAmount]
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      setRepayStatuses((prev) => ({ ...prev, repay: "실패" }));
      throw new Error("상환 트랜잭션이 블록에서 되돌려졌습니다.");
    }

    setRepayExecution({
      txHash,
      status: "success",
      blockNumber: receipt.blockNumber.toString(),
      borrowerWallet: actionBorrowerWallet as `0x${string}`,
      repayAmount: actualRepayAmount.toString()
    });

    await fetch(`${backendUrl}/loans/positions/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        borrowerWallet: actionBorrowerWallet
      })
    });

    setRepayStatuses((prev) => ({ ...prev, repay: "완료" }));
    setDebtApproved(false);
    setRepayStatuses((prev) => ({ ...prev, debtApprove: "대기 중" }));
    await refreshPositions();
    setPositionsRefreshKey((prev) => prev + 1);
  }

  async function previewWithdraw() {
    if (!effectiveRequestOwner || !actionBorrowerWallet) return;

    setRepayStatuses((prev) => ({ ...prev, withdrawPreview: "진행 중..." }));

    const response = await fetch(`${backendUrl}/loans/withdraw-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner: effectiveRequestOwner,
        borrowerWallet: actionBorrowerWallet,
        withdrawAmount: parseEther(withdrawAmount).toString()
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Failed to preview withdraw");
    }

    const data = (await response.json()) as WithdrawPreviewResponse;
    setWithdrawPreview(data);
    setRepayStatuses((prev) => ({ ...prev, withdrawPreview: "완료" }));
  }

  async function executeWithdraw() {
    if (!address || !effectiveRequestOwner || !actionBorrowerWallet || !withdrawRecipient) return;

    setRepayStatuses((prev) => ({ ...prev, withdraw: "진행 중..." }));

    const nonce = keccak256(
      stringToHex(`${effectiveRequestOwner}:${actionBorrowerWallet}:${withdrawAmount}:${withdrawRecipient}:${Date.now()}`)
    );
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 10 * 60);
    const amount = parseEther(withdrawAmount);

    const ownerSignature = await signTypedDataAsync({
      domain: {
        name: "KarmaSessionLending",
        version: "1",
        chainId,
        verifyingContract: lendingAddress
      },
      primaryType: "WithdrawAuthorization",
      types: {
        WithdrawAuthorization: [
          { name: "owner", type: "address" },
          { name: "borrowerWallet", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "to", type: "address" },
          { name: "expiresAt", type: "uint256" },
          { name: "nonce", type: "bytes32" }
        ]
      },
      message: {
        owner: effectiveRequestOwner,
        borrowerWallet: actionBorrowerWallet as `0x${string}`,
        amount,
        to: withdrawRecipient as `0x${string}`,
        expiresAt,
        nonce
      }
    });

    const response = await fetch(`${backendUrl}/loans/withdraw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner: effectiveRequestOwner,
        borrowerWallet: actionBorrowerWallet,
        to: withdrawRecipient,
        withdrawAmount: amount.toString(),
        expiresAt: expiresAt.toString(),
        nonce,
        ownerSignature
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Failed to execute withdraw");
    }

    const data = (await response.json()) as ExecuteWithdrawResponse;
    setWithdrawExecution(data);
    setRepayStatuses((prev) => ({ ...prev, withdraw: "완료" }));
    await refreshPositions();
    setPositionsRefreshKey((prev) => prev + 1);
  }

  return (
    <section className="loan-shell">
      <div className="card workflow-nav-card">
        <div className="workflow-nav" role="tablist" aria-label="워크플로 탭">
          <button
            className={activeTab === "home" ? "nav-active" : "nav-idle"}
            onClick={() => setActiveTab("home")}
            role="tab"
            aria-selected={activeTab === "home"}
          >
            홈
          </button>
          <button
            className={activeTab === "deposit" ? "nav-active" : "nav-idle"}
            onClick={() => setActiveTab("deposit")}
            role="tab"
            aria-selected={activeTab === "deposit"}
          >
            예치
          </button>
          <button
            className={activeTab === "position" ? "nav-active" : "nav-idle"}
            onClick={() => setActiveTab("position")}
            disabled={!depositFlowComplete}
            role="tab"
            aria-selected={activeTab === "position"}
          >
            대출
          </button>
          <button
            className={activeTab === "repay" ? "nav-active" : "nav-idle"}
            onClick={() => setActiveTab("repay")}
            disabled={!depositFlowComplete}
            role="tab"
            aria-selected={activeTab === "repay"}
          >
            상환
          </button>
          <button
            className={activeTab === "allPositions" ? "nav-active" : "nav-idle"}
            onClick={() => setActiveTab("allPositions")}
            role="tab"
            aria-selected={activeTab === "allPositions"}
          >
            전체 포지션
          </button>
        </div>
      </div>

      <div className={activeTab === "allPositions" || activeTab === "home" ? "loan-layout loan-layout-wide" : "loan-layout"}>
        <section className="card loan-card">
          <div className="loan-main">
            <div className="wallet-bar">
              <h2 className="section-title">
                {activeTab === "home"
                  ? "홈"
                  : activeTab === "deposit"
                  ? "예치 흐름"
                  : activeTab === "position"
                    ? "대출"
                    : activeTab === "repay"
                      ? "상환"
                      : "전체 포지션"}
              </h2>
              <ConnectButton />
            </div>

        {activeTab === "home" && (
          <div className="side-block home-panel">
            <div className="flow-grid">
              <div className="full owner-panel">
                <span className="owner-label">기준 오너 A</span>
                <span className="owner-value mono">
                  {effectiveRequestOwner ?? "오너 A가 아직 정해지지 않았습니다"}
                </span>
              </div>
            </div>

            {effectiveRequestOwner ? (
              <>
                <div className="result-section home-summary-section">
                  <span className="summary-label">오너 지갑 요약</span>
                  <div className="result-grid home-summary-grid">
                    <div className="summary-card">
                      <span className="summary-label">총 예치</span>
                      <strong className="summary-value">{formatEther(homeTotalCollateral)} ETH</strong>
                    </div>
                    <div className="summary-card">
                      <span className="summary-label">총 대출 중</span>
                      <strong className="summary-value">{formatEther(homeTotalDebt)} sDAI</strong>
                    </div>
                    <div className="summary-card">
                      <span className="summary-label">포지션 수</span>
                      <strong className="summary-value">{homePositionRecords.length}</strong>
                    </div>
                  </div>
                </div>

                {sortedHomePositionRecords.length > 0 ? (
                  <div className="result-section home-position-section">
                    <span className="summary-label">내 포지션</span>
                    <div className="generated-wallet-grid all-position-grid home-position-grid">
                      {sortedHomePositionRecords.map((record, index) => {
                        const snapshot = positionSnapshots[record.borrowerWallet];
                        const createdAtLabel = formatCreatedAtLabel(record.createdAt);
                        const updatedAtLabel = formatCreatedAtLabel(record.updatedAt);

                        return (
                          <div
                            className={
                              address && record.borrowerWallet.toLowerCase() === address.toLowerCase()
                                ? "generated-wallet-card position-card-connected"
                                : "generated-wallet-card"
                            }
                            key={record.borrowerWallet}
                          >
                            <div className="position-card-head">
                              <div className="position-head-meta">
                                <span className="generated-wallet-tag">{`B${index + 1}`}</span>
                                {createdAtLabel && (
                                  <span className="muted position-inline-meta">{`${createdAtLabel} 생성됨`}</span>
                                )}
                              </div>
                            </div>
                            <strong className="generated-wallet-address mono home-wallet-address">{record.borrowerWallet}</strong>
                            <div className="position-metric-grid">
                              <div className="position-metric-card position-metric-wide">
                                <span className="position-metric-label">예치</span>
                                <strong className="position-metric-value">
                                  {formatEther(BigInt(snapshot?.collateral ?? record.collateral))} ETH
                                </strong>
                              </div>
                              <div className="position-metric-card">
                                <span className="position-metric-label">현재 부채</span>
                                <strong className="position-metric-value">
                                  {formatEther(BigInt(snapshot?.debt ?? record.debt))} sDAI
                                </strong>
                              </div>
                              <div
                                className={
                                  snapshot && BigInt(snapshot.availableBorrow) === 0n
                                    ? "position-metric-card position-metric-muted"
                                    : "position-metric-card"
                                }
                              >
                                <span className="position-metric-label">추가 대출 가능</span>
                                <strong className="position-metric-value">
                                  {formatEther(BigInt(snapshot?.availableBorrow ?? "0"))} sDAI
                                </strong>
                              </div>
                              <div className="position-metric-card">
                                <span className="position-metric-label">현재 LTV</span>
                                <strong className="position-metric-value">
                                  {(snapshot?.currentLtvBps ?? record.currentLtvBps)} bps
                                </strong>
                              </div>
                              <div className="position-metric-card">
                                <span className="position-metric-label">LT</span>
                                <strong className="position-metric-value">
                                  {(snapshot?.liquidationLtvBps ?? record.liquidationLtvBps)} bps
                                </strong>
                              </div>
                            </div>
                            <div className="position-card-footer">
                              <span />
                              <span className="muted">{updatedAtLabel ? `${updatedAtLabel} 변경` : ""}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="muted">이 오너 A에 연결된 포지션이 없습니다.</p>
                )}
              </>
            ) : (
              <p className="muted">먼저 오너 A가 결정되어야 홈 요약을 볼 수 있습니다.</p>
            )}
          </div>
        )}

        {activeTab === "deposit" && (
          <div className="side-block">
            <div className="deposit-progress">
              <div
                className="deposit-progress-fill"
                style={{ width: `${depositProgressPercent}%` }}
              />
            </div>
            <div
              className="deposit-progress-labels"
              aria-hidden="true"
              style={{ gridTemplateColumns: `repeat(${depositStepMeta.length}, minmax(0, 1fr))` }}
            >
              {depositStepMeta.map((step, index) => (
                <span
                  key={step.title}
                  className={
                    index < completedDepositSteps
                      ? "progress-done"
                      : index === depositStep
                        ? "progress-current"
                        : "progress-pending"
                  }
                >
                  {index + 1}
                </span>
              ))}
            </div>
            <h3 className="section-title">{depositStepMeta[depositStep]?.title}</h3>
            <p className="muted step-status">{depositStepMeta[depositStep]?.status}</p>

            {(depositOwnerLocked || depositBorrowerLocked) && (
              <div className="full summary-card warning-card">
                <span className="summary-label">예치 지갑 전환 필요</span>
                <strong className="summary-value mono">
                  {depositBorrowerLocked ? address : ownerAddress}
                </strong>
                <p className="muted completion-copy">
                  {depositBorrowerLocked
                    ? "B 지갑은 예치 탭을 진행할 수 없습니다. 오너 A 지갑으로 돌아와야 합니다."
                    : "예치 탭의 진행은 분할 계획을 승인한 오너 A 지갑에서만 할 수 있습니다."}
                </p>
              </div>
            )}

            {depositStep === 0 && (
              <div className="flow-grid">
                <div className="full owner-panel">
                  <span className="owner-label">현재 계정의 오너 A</span>
                  <span className="owner-value mono">
                    {ownerAddress ?? activePlanOwner ?? "오너 A가 아직 정해지지 않았습니다"}
                  </span>
                </div>
                {ownerPolicy && (
                  <div className="full result-section">
                    <span className="summary-label">카르마 혜택 정책</span>
                    <div className="result-grid">
                      <div className="summary-card">
                        <span className="summary-label">정책</span>
                        <strong className="summary-value">{ownerPolicy.policyName}</strong>
                      </div>
                      <div className="summary-card">
                        <span className="summary-label">기본 LTV</span>
                        <strong className="summary-value">{ownerPolicy.maxLtvBps} bps</strong>
                      </div>
                      <div className="summary-card">
                        <span className="summary-label">LT</span>
                        <strong className="summary-value">{ownerPolicy.liquidationLtvBps} bps</strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {depositStep === 1 && (
              <div className="flow-grid">
                <div className="field">
                  <label>희망 대출 금액 (sDAI)</label>
                  <input value={borrowAmount} onChange={(e) => setBorrowAmount(e.target.value)} />
                </div>
                {quote && (
                  <div className="full result-section">
                    <span className="summary-label">결과</span>
                    <div className="result-grid">
                      <div className="summary-card">
                        <span className="summary-label">필요</span>
                        <strong className="summary-value">
                          {formatEther(BigInt(quote.collateralRequired))} ETH
                        </strong>
                      </div>
                      <div className="summary-card">
                        <span className="summary-label">대출 가능</span>
                        <strong className="summary-value">
                          {formatEther(BigInt(quote.borrowAmount))} sDAI
                        </strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {depositStep === 2 && quote && (
              <div className="flow-grid">
                <div className="full">
                  <div className="split-total-banner">
                    <span className="split-total-label">전체 예치금</span>
                    <strong className="split-total-value">
                      {formatEther(BigInt(quote.collateralRequired))} ETH
                    </strong>
                  </div>
                  <div className="split-draft-header">
                    <div>
                      <label className="split-draft-title">분할 지갑 설정</label>
                      <p className="muted split-draft-copy">
                        마지막 카드는 남은 ETH를 자동으로 모두 받습니다.
                      </p>
                    </div>
                  </div>

                  <div className="split-draft-list">
                    {editableSplitDrafts.map((draft, index) => {
                      const preview = splitDraft.previews[index];
                      return (
                        <div className="split-draft-card" key={draft.id}>
                          <div className="split-draft-card-head">
                            <strong>{`지갑 ${index + 1}`}</strong>
                            <button
                              className="secondary split-remove-button"
                              onClick={() => removeSplitDraftCard(draft.id)}
                              disabled={editableSplitDrafts.length === 0}
                            >
                              삭제
                            </button>
                          </div>
                          <div className="split-draft-controls">
                            <div className="field">
                              <label>비율 (%)</label>
                              <input
                                value={draft.percent}
                                onChange={(e) => updateSplitPercent(draft.id, e.target.value)}
                                placeholder="예: 35"
                              />
                            </div>
                            <div className="field">
                              <label>예치금</label>
                              <input
                                value={draft.amount}
                                onChange={(e) => updateSplitAmount(draft.id, e.target.value)}
                                placeholder="예: 52.5"
                              />
                            </div>
                          </div>
                          <p className="muted split-draft-meta">
                            {preview
                              ? `${formatEther(preview.amount)} ETH / ${preview.percentageLabel}%`
                              : "입력 대기 중"}
                          </p>
                        </div>
                      );
                    })}

                    <div className="split-draft-card split-draft-auto">
                      <div className="split-draft-card-head">
                        <strong>{`지갑 ${editableSplitDrafts.length + 1}`}</strong>
                        <span className="auto-chip">자동</span>
                      </div>
                      <div className="split-draft-controls">
                        <div className="field">
                          <label>비율 (%)</label>
                          <input
                            readOnly
                            value={splitDraft.previews.at(-1)?.percentageLabel ?? "0.00"}
                          />
                        </div>
                        <div className="field">
                          <label>예치금</label>
                          <input
                            readOnly
                            value={
                              splitDraft.previews.at(-1)
                                ? formatEther(splitDraft.previews.at(-1)!.amount)
                                : "0"
                            }
                          />
                        </div>
                      </div>
                      <p className="muted split-draft-meta">
                        {splitDraft.previews.at(-1)
                          ? `${formatEther(splitDraft.previews.at(-1)!.amount)} ETH / ${splitDraft.previews.at(-1)!.percentageLabel}%`
                          : "남은 ETH 자동 계산"}
                      </p>
                    </div>

                    <button className="add-split-tile" onClick={addSplitDraftCard} aria-label="지갑 추가">
                      <span>+</span>
                    </button>
                  </div>

                </div>
              </div>
            )}

            {depositStep === 3 && quote && (
              <div className="flow-grid">
                <div className="full summary-card">
                  <span className="summary-label">분할 계획 승인</span>
                  <strong className="summary-value">
                    {splitPlanSignature ? "승인 완료" : "오너 승인 필요"}
                  </strong>
                  <p className="muted completion-copy">
                    {splitPlanSignature
                      ? "A가 B 지갑 분할 계획을 승인했습니다."
                      : "생성된 B 지갑 구성으로 분할 계획 승인을 먼저 진행합니다."}
                  </p>
                </div>
              </div>
            )}

            {depositStep === 4 && (
              <div className="flow-grid">
                {!depositOwnerMatches && ownerAddress && (
                  <div className="full summary-card warning-card">
                    <span className="summary-label">오너 지갑으로 복귀 필요</span>
                    <strong className="summary-value mono">{ownerAddress}</strong>
                    <p className="muted completion-copy">
                      다음 단계로 넘어가려면 분할 계획을 승인한 원래 오너 A 계정으로 돌아와야 합니다.
                    </p>
                  </div>
                )}
                <div className="full summary-card">
                  <span className="summary-label">B 지갑 연결 준비</span>
                  <strong className="summary-value">
                    {allSplitWalletsAdded ? "연결 확인 완료" : "계정 추가 필요"}
                  </strong>
                  <p className="muted completion-copy">
                    B 지갑 정보를 보고 메타마스크에 계정을 추가한 뒤 연결 상태를 확인합니다.
                  </p>
                </div>
                <div className="full">
                  <label className="split-draft-title">생성된 B 지갑</label>
                  {splitWallets.length > 0 ? (
                    <div className="generated-wallet-grid">
                      {splitWallets.map((wallet, index) => {
                        const connected =
                          Boolean(address) && address!.toLowerCase() === wallet.address.toLowerCase();
                        const added = addedSplitWallets.some(
                          (savedWallet) => savedWallet.toLowerCase() === wallet.address.toLowerCase()
                        );

                        return (
                          <div className="generated-wallet-card" key={wallet.address}>
                            <div className="position-card-head">
                              <span className="generated-wallet-tag">{`B${index + 1}`}</span>
                              <span
                                className={
                                  connected
                                    ? "generated-wallet-connection generated-wallet-connection-active"
                                    : added
                                      ? "generated-wallet-connection generated-wallet-connection-ready"
                                      : "generated-wallet-connection"
                                }
                              >
                                {connected ? "현재 연결됨" : added ? "연결" : "미연결"}
                              </span>
                            </div>
                            <strong className="generated-wallet-address mono">{wallet.address}</strong>
                            <div className="generated-wallet-meta">
                              <span>{formatEther(wallet.collateralAmount)} ETH</span>
                              <span>{wallet.percentage.toFixed(2)}%</span>
                            </div>
                            <div className="actions generated-wallet-actions">
                              <button
                                className="secondary"
                                type="button"
                                onClick={() => {
                                  setActionBorrowerWallet(wallet.address);
                                  setShowWalletInfoModal(true);
                                }}
                              >
                                지갑 정보 보기
                              </button>
                              <button
                                className="secondary"
                                type="button"
                                onClick={() => {
                                  setActionBorrowerWallet(wallet.address);
                                  setShowAddAccountGuideModal(true);
                                }}
                              >
                                계정 추가
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="summary-card">
                      <span className="summary-label">생성 상태</span>
                      <strong className="summary-value">아직 생성되지 않음</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {depositStep === 5 && quote && (
              <div className="flow-grid">
                {!depositOwnerMatches && ownerAddress && (
                  <div className="full summary-card warning-card">
                    <span className="summary-label">오너 지갑 전환 필요</span>
                    <strong className="summary-value mono">{ownerAddress}</strong>
                    <p className="muted completion-copy">
                      담보 예치는 분할 계획을 승인한 오너 A 지갑에서만 진행할 수 있습니다.
                    </p>
                  </div>
                )}
                <div className="full summary-card">
                  <span className="summary-label">
                    {collateralApproved ? "예치 및 배정할 ETH" : "승인 및 예치할 ETH"}
                  </span>
                  <strong className="summary-value">
                    {formatEther(BigInt(quote.collateralRequired))} ETH
                  </strong>
                  <p className="muted completion-copy">
                    담보를 예치한 뒤, 미리 서명한 계획으로 B 포지션에 바로 배정합니다.
                  </p>
                </div>
              </div>
            )}

            <div className="actions">
              {depositStep === 0 && (
                <button
                  className="primary"
                  onClick={fetchOwnerPolicy}
                  disabled={!address || depositOwnerLocked || depositBorrowerLocked}
                >
                  카르마 혜택 조회
                </button>
              )}
              {depositStep === 1 && (
                <button
                  className="primary"
                  onClick={requestQuote}
                  disabled={!address || !ownerPolicy || requestedQuoteAmount <= 0n || depositOwnerLocked || depositBorrowerLocked}
                >
                  견적 요청
                </button>
              )}
              {depositStep === 2 && (
                <button
                  className="primary"
                  onClick={generateSplitWallets}
                  disabled={!quote || !splitConfigValid || splitWallets.length > 0 || depositOwnerLocked || depositBorrowerLocked}
                >
                  분할 지갑 생성
                </button>
              )}
              {depositStep === 3 && (
                <button
                  className="primary"
                  onClick={signSplitPlan}
                  disabled={!address || splitWallets.length === 0 || !quote || Boolean(splitPlanSignature) || depositOwnerLocked || depositBorrowerLocked}
                >
                  분할 계획 승인
                </button>
              )}
              {depositStep === 4 && (
                <button
                  className="secondary"
                  onClick={() => setShowAddAccountGuideModal(true)}
                  disabled={!actionBorrowerWallet || depositOwnerLocked || depositBorrowerLocked}
                >
                  계정 추가 안내
                </button>
              )}
              {depositStep === 5 && (
                <button
                  className="primary"
                  onClick={
                    allocationTxHash
                      ? startNewDepositFlow
                      : collateralApproved
                        ? depositCollateral
                        : approveCollateral
                  }
                  disabled={
                    allocationTxHash
                      ? false
                      : !quote ||
                        splitWallets.length === 0 ||
                        !splitPlanSignature ||
                        collateralDeposited ||
                        !depositOwnerMatches ||
                        depositBorrowerLocked
                  }
                >
                  {allocationTxHash
                    ? "새 담보 예치"
                    : collateralApproved
                      ? "A 담보 예치 및 배정"
                      : "담보 승인"}
                </button>
              )}

              <button
                className="secondary"
                onClick={() => setDepositStep((prev) => Math.max(0, prev - 1))}
                disabled={depositStep === 0}
              >
                이전 단계
              </button>
              <button
                className="secondary"
                onClick={() => {
                  if (depositStep < depositStepMeta.length - 1) {
                    setDepositStep((prev) => prev + 1);
                  }
                }}
                disabled={
                  depositStep >= depositStepMeta.length - 1 ||
                  !canAdvanceDepositStep(depositStep) ||
                  depositOwnerLocked ||
                  depositBorrowerLocked
                }
              >
                다음 단계
              </button>
              {allocationTxHash && (
                <div className="inline-toast inline-toast-success">
                  {quote
                    ? `${formatEther(BigInt(quote.collateralRequired))} ETH가 계획대로 예치되었습니다.`
                    : "계획된 담보가 예치되었습니다."}
                </div>
              )}
              {toastMessage && <div className="inline-toast">{toastMessage}</div>}
            </div>
          </div>
        )}

        {activeTab === "position" && (
          <div className="side-block">
            <h3 className="section-title">대출</h3>
            {depositFlowComplete ? (
              <>
                <div className="flow-grid">
                  <div className="full">
                    <label className="split-draft-title">작업할 borrower wallet B</label>
                    <div className="generated-wallet-grid selector-grid">
                      {dbSplitWallets.map((wallet) => (
                        <button
                          key={wallet}
                          type="button"
                          className={
                            actionBorrowerWallet === wallet
                              ? "generated-wallet-card wallet-selector wallet-selector-active"
                              : "generated-wallet-card wallet-selector"
                          }
                          onClick={() => setActionBorrowerWallet(wallet)}
                        >
                          <span className="generated-wallet-tag">{`B${getBorrowerIndex(wallet) + 1}`}</span>
                          <strong className="generated-wallet-address mono">{wallet}</strong>
                          {positionSnapshots[wallet] && (
                            <div className="generated-wallet-meta position-card-meta">
                              <span>{`담보 ${formatEther(BigInt(positionSnapshots[wallet].collateral))} ETH`}</span>
                              <span>{`대출 가능 ${formatEther(BigInt(positionSnapshots[wallet].availableBorrow))} sDAI`}</span>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flow-grid loan-section-grid">
                  <div className="full loan-section-card">
                    <div className="loan-section-head">
                      <div>
                        <strong>대출 가능 확인</strong>
                        <p className="muted loan-section-copy">
                          선택한 B 지갑으로 지금 추가 대출이 가능한 범위를 확인합니다.
                        </p>
                      </div>
                      <span className="loan-status-chip">{positionStatuses.borrowPreview}</span>
                    </div>
                    <div className="flow-grid compact-grid">
                      <div className="field">
                        <label>희망 대출 금액 (sDAI)</label>
                        <input
                          value={borrowAmount}
                          onChange={(e) => setBorrowAmount(clampBorrowAmountInput(e.target.value))}
                        />
                        {borrowExceedsCapacity && (
                          <span className="field-warning">
                            {`최대 ${formatEther(currentAvailableBorrow)} sDAI까지 대출할 수 있습니다.`}
                          </span>
                        )}
                        {borrowNotice && <span className="field-warning">{borrowNotice}</span>}
                      </div>
                    </div>
                    <div className="result-section">
                      <span className="summary-label">미리보기 결과</span>
                      <div className="summary-card preview-shell-card">
                        <span className="generated-wallet-tag">
                          {selectedBorrowerIndex >= 0 ? `B${selectedBorrowerIndex + 1}` : "B"}
                        </span>
                        <div className="tx-sheet">
                          <div className="tx-row">
                            <span className="tx-label">대출한도</span>
                            <strong className="tx-value">
                              {`${formatEther(currentBorrowLimit)} sDAI`}
                            </strong>
                          </div>
                          <div className="tx-row">
                            <span className="tx-label">대출 가능 금액</span>
                            <strong className="tx-value">
                              {`${formatEther(currentAvailableBorrow)} sDAI`}
                            </strong>
                          </div>
                          {borrowPreview && (
                            <>
                              <div className="withdraw-preview-status">
                                <span className="tx-label">대출 가능 여부</span>
                                <span className="withdraw-status-pill withdraw-status-allowed">
                                  대출 가능
                                </span>
                              </div>
                              <div className="withdraw-preview-grid">
                                <div className="withdraw-preview-card">
                                  <span className="tx-label">대출 금액</span>
                                  <strong className="tx-value">
                                    {`${formatEther(requestedBorrowAmount)} sDAI`}
                                  </strong>
                                </div>
                                <div className="withdraw-preview-card">
                                  <span className="tx-label">대출 가능 잔액</span>
                                  <strong className="tx-value">
                                    {`${formatEther(remainingBorrowAfterRequest)} sDAI`}
                                  </strong>
                                </div>
                                <div className="withdraw-preview-card">
                                  <span className="tx-label">실행 후 LTV</span>
                                  <strong className="tx-value">
                                    {`${resultingLtvBps.toString()} bps`}
                                  </strong>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                        {nearLiquidation && (
                          <div className="summary-card risk-card">
                            <span className="summary-label">청산 위험 경고</span>
                            <strong className="summary-value">LT에 매우 가깝습니다</strong>
                            <p className="muted completion-copy">
                              실행 후 LTV가 LT와 50 bps 이내라 청산 위험이 빠르게 커질 수 있습니다.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="actions actions-right">
                      <button
                        className="primary"
                        onClick={previewBorrow}
                        disabled={
                          !address ||
                          !actionBorrowerWallet ||
                          requestedBorrowAmount <= 0n ||
                          currentAvailableBorrow <= 0n
                        }
                      >
                        대출 미리보기
                      </button>
                    </div>
                  </div>

                  <div className="full loan-section-card">
                    <div className="loan-section-head">
                      <div>
                        <strong>대출 실행</strong>
                        <p className="muted loan-section-copy">
                          백엔드 승인으로 선택한 B 지갑에 sDAI 대출을 실행합니다.
                        </p>
                      </div>
                      <span className="loan-status-chip">{borrowExecution ? borrowExecution.status : positionStatuses.borrow}</span>
                    </div>
                    <div className="result-section">
                      <span className="summary-label">실행 정보</span>
                      <div className="summary-card preview-shell-card">
                        <span className="generated-wallet-tag">
                          {selectedBorrowerIndex >= 0 ? `B${selectedBorrowerIndex + 1}` : "B"}
                        </span>
                        <div className="tx-sheet">
                          <div className="tx-row">
                            <span className="tx-label">수령 주소</span>
                            <strong className="tx-value mono">
                              {borrowPreview ? borrowPreview.receiver : "아직 없음"}
                            </strong>
                          </div>
                          <div className="tx-row">
                            <span className="tx-label">대출 실행 금액</span>
                            <strong className="tx-value">
                              {borrowPreview
                                ? `${formatEther(requestedBorrowAmount)} sDAI`
                                : "아직 없음"}
                            </strong>
                          </div>
                          <div className="tx-row">
                            <span className="tx-label">대출 가능 잔액</span>
                            <strong className="tx-value">
                              {borrowPreview ? `${formatEther(remainingBorrowAfterRequest)} sDAI` : "아직 없음"}
                            </strong>
                          </div>
                          <div className="tx-row">
                            <span className="tx-label">실행 후 LTV</span>
                            <strong className="tx-value">
                              {borrowPreview ? `${resultingLtvBps.toString()} bps` : "아직 없음"}
                            </strong>
                          </div>
                        </div>
                        {borrowExecution && (
                          <div className="summary-card">
                            <span className="summary-label">실행 결과</span>
                            <strong className="summary-value">
                              {`block ${borrowExecution.blockNumber}`}
                            </strong>
                            <p className="muted completion-copy">
                              {`${formatEther(BigInt(borrowExecution.borrowAmount))} sDAI가 실행되었습니다.`}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="actions actions-right">
                      <button
                        className="primary"
                        onClick={executeBorrow}
                        disabled={
                          !borrowPreview ||
                          positionStatuses.borrow === "진행 중..." ||
                          borrowExecution?.status === "success"
                        }
                      >
                        대출 실행
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="muted">예치 탭에서 분할 계획 승인과 담보 배정을 끝내야 합니다.</p>
            )}
          </div>
        )}

        {activeTab === "repay" && (
          <div className="side-block">
            <h3 className="section-title">상환</h3>
            {depositFlowComplete ? (
              <>
                <div className="flow-grid">
                  <div className="full">
                    <label className="split-draft-title">작업할 borrower wallet B</label>
                    <div className="generated-wallet-grid selector-grid">
                      {dbSplitWallets.map((wallet) => (
                        <button
                          key={wallet}
                          type="button"
                          className={
                            actionBorrowerWallet === wallet
                              ? "generated-wallet-card wallet-selector wallet-selector-active"
                              : "generated-wallet-card wallet-selector"
                          }
                          onClick={() => setActionBorrowerWallet(wallet)}
                        >
                          <span className="generated-wallet-tag">{`B${getBorrowerIndex(wallet) + 1}`}</span>
                          <strong className="generated-wallet-address mono">{wallet}</strong>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flow-grid loan-section-grid">
                  <div className="full loan-section-card">
                    <div className="loan-section-head">
                      <div>
                        <strong>부채 상환</strong>
                        <p className="muted loan-section-copy">
                          선택한 B 지갑의 sDAI 부채를 상환합니다.
                        </p>
                      </div>
                      <span className="loan-status-chip">{repayStatuses.repay}</span>
                    </div>

                    <div className="flow-grid compact-grid">
                      <div className="field">
                        <label>상환 금액 (sDAI)</label>
                        <input
                          value={repayAmount}
                          onChange={(e) => setRepayAmount(clampRepayAmountInput(e.target.value))}
                        />
                      </div>
                    </div>

                    <div className="result-section">
                      <span className="summary-label">실행 정보</span>
                      <div className="summary-card preview-shell-card">
                        <span className="generated-wallet-tag">
                          {selectedBorrowerIndex >= 0 ? `B${selectedBorrowerIndex + 1}` : "B"}
                        </span>
                        <div className="tx-sheet">
                          <div className="tx-row">
                            <span className="tx-label">현재 부채</span>
                            <strong className="tx-value">
                              {selectedPosition
                                ? `${formatEther(BigInt(selectedPosition.debt))} sDAI`
                                : "아직 없음"}
                            </strong>
                          </div>
                          <div className="tx-row">
                            <span className="tx-label">상환 금액</span>
                            <strong className="tx-value">
                              {`${repayAmount || "0"} sDAI`}
                            </strong>
                          </div>
                          <div className="tx-row">
                            <span className="tx-label">남은 부채</span>
                            <strong className="tx-value">
                              {selectedPosition
                                ? `${formatEther(
                                    BigInt(selectedPosition.debt) > parseEtherInput(repayAmount)
                                      ? BigInt(selectedPosition.debt) - parseEtherInput(repayAmount)
                                      : 0n
                                  )} sDAI`
                                : "아직 없음"}
                            </strong>
                          </div>
                        </div>
                      </div>

                      {repayExecution && (
                        <div className="summary-card success-card">
                          <span className="summary-label">상환 결과</span>
                          <strong className="summary-value">
                            {`block ${repayExecution.blockNumber}`}
                          </strong>
                          <span className="muted">
                            {`${formatEther(BigInt(repayExecution.repayAmount))} sDAI가 상환되었습니다.`}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="actions actions-right">
                      <button
                        className="secondary"
                        onClick={approveDebtToken}
                        disabled={!actionBorrowerWallet || parseEtherInput(repayAmount) <= 0n}
                      >
                        부채 토큰 승인
                      </button>
                      <button
                        className="primary"
                        onClick={repayDebt}
                        disabled={!actionBorrowerWallet || !debtApproved}
                      >
                        상환
                      </button>
                    </div>
                  </div>

                  <div className="full loan-section-card">
                    <div className="loan-section-head">
                      <div>
                        <strong>담보 출금</strong>
                        <p className="muted loan-section-copy">
                          상환 후 남는 담보를 확인하고 선택한 주소로 출금합니다.
                        </p>
                      </div>
                      <span className="loan-status-chip">
                        {withdrawExecution ? withdrawExecution.status : repayStatuses.withdraw}
                      </span>
                    </div>

                    <div className="flow-grid compact-grid">
                      <div className="field">
                        <label>희망 출금 금액 (ETH)</label>
                        <input
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(clampWithdrawAmountInput(e.target.value))}
                        />
                        {withdrawNotice && <span className="field-warning">{withdrawNotice}</span>}
                      </div>
                    </div>

                    <div className="result-section">
                      <span className="summary-label">출금 가능 담보 미리보기</span>
                      <div className="summary-card preview-shell-card">
                        <span className="generated-wallet-tag">
                          {selectedBorrowerIndex >= 0 ? `B${selectedBorrowerIndex + 1}` : "B"}
                        </span>
                        <div className="tx-sheet">
                          <div className="tx-row">
                            <span className="tx-label">현재 담보</span>
                            <strong className="tx-value">
                              {selectedPosition
                                ? `${formatEther(BigInt(selectedPosition.collateral))} ETH`
                                : "아직 없음"}
                            </strong>
                          </div>
                          <div className="tx-row">
                            <span className="tx-label">출금 가능 금액</span>
                            <strong className="tx-value">
                              {withdrawPreview
                                ? `${formatEther(BigInt(withdrawPreview.maxWithdrawAmount))} ETH`
                                : "아직 없음"}
                            </strong>
                          </div>
                          {withdrawPreview && (
                            <>
                              <div className="withdraw-preview-status">
                                <span className="tx-label">출금 가능 여부</span>
                                <span
                                  className={
                                    withdrawPreview.allowed
                                      ? "withdraw-status-pill withdraw-status-allowed"
                                      : "withdraw-status-pill withdraw-status-blocked"
                                  }
                                >
                                  {withdrawPreview.allowed ? "출금 가능" : "출금 불가"}
                                </span>
                              </div>
                              <div className="withdraw-preview-grid">
                                <div className="withdraw-preview-card">
                                  <span className="tx-label">남은 담보</span>
                                  <strong className="tx-value">
                                    {`${formatEther(BigInt(withdrawPreview.remainingCollateral))} ETH`}
                                  </strong>
                                </div>
                                <div className="withdraw-preview-card">
                                  <span className="tx-label">남은 부채</span>
                                  <strong className="tx-value">
                                    {`${formatEther(BigInt(withdrawPreview.currentDebt))} sDAI`}
                                  </strong>
                                </div>
                                <div className="withdraw-preview-card">
                                  <span className="tx-label">결과 LTV</span>
                                  <strong className="tx-value">
                                    {`${withdrawPreview.resultingLtvBps} bps`}
                                  </strong>
                                </div>
                              </div>
                              {withdrawNearLiquidation && (
                                <div className="position-warning-card">
                                  <span className="position-warning-label">청산 위험 경고</span>
                                  <strong className="position-warning-value">LT에 매우 가깝습니다</strong>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="actions actions-right">
                        <button
                          className="primary"
                          onClick={previewWithdraw}
                          disabled={!address || !actionBorrowerWallet}
                        >
                          출금 미리보기
                        </button>
                      </div>
                    </div>

                    <div className="result-section">
                      <span className="summary-label">출금 실행</span>
                      <div className="summary-card preview-shell-card">
                        <span className="generated-wallet-tag">
                          {selectedBorrowerIndex >= 0 ? `B${selectedBorrowerIndex + 1}` : "B"}
                        </span>
                        <div className="flow-grid compact-grid">
                          <div className="field">
                            <label>수령 주소</label>
                            <input
                              value={withdrawRecipient}
                              onChange={(e) => setWithdrawRecipient(e.target.value)}
                              placeholder="0x..."
                            />
                          </div>
                        </div>
                        <div className="tx-sheet">
                          <div className="tx-row">
                            <span className="tx-label">출금 금액</span>
                            <strong className="tx-value">{`${withdrawAmount || "0"} ETH`}</strong>
                          </div>
                          <div className="tx-row">
                            <span className="tx-label">수령 주소</span>
                            <strong className="tx-value mono">
                              {withdrawRecipient || "아직 없음"}
                            </strong>
                          </div>
                          <div className="tx-row">
                            <span className="tx-label">실행 상태</span>
                            <strong className="tx-value">
                              {withdrawExecution ? withdrawExecution.status : repayStatuses.withdraw}
                            </strong>
                          </div>
                        </div>
                        {withdrawExecution && (
                          <div className="summary-card">
                            <span className="summary-label">실행 결과</span>
                            <strong className="summary-value">
                              {`block ${withdrawExecution.blockNumber}`}
                            </strong>
                            <p className="muted completion-copy">
                              {`${formatEther(BigInt(withdrawExecution.withdrawAmount))} ETH가 출금되었습니다.`}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="actions actions-right">
                      <button
                        className="primary"
                        onClick={executeWithdraw}
                        disabled={!withdrawRecipient || !actionBorrowerWallet || !withdrawPreview?.allowed}
                      >
                        출금 실행
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="muted">예치 탭에서 분할 계획 승인과 담보 배정을 끝내야 합니다.</p>
            )}
          </div>
        )}

        {activeTab === "allPositions" && (
          <div className="side-block">
            <h3 className="section-title">컨트랙트 전체 포지션</h3>
            {allPositionRecords.length > 0 ? (
              <div className="generated-wallet-grid all-position-grid">
                {allPositionRecords.map((record, index) => {
                  const snapshot = positionSnapshots[record.borrowerWallet];
                  const createdAtLabel = formatCreatedAtLabel(record.createdAt);

                  return (
                    <div
                      className={
                        address && record.borrowerWallet.toLowerCase() === address.toLowerCase()
                          ? "generated-wallet-card all-position-card position-card-connected"
                          : "generated-wallet-card all-position-card"
                      }
                      key={record.borrowerWallet}
                    >
                      <div className="position-card-head">
                        <div className="position-head-meta">
                          <span className="generated-wallet-tag">{`P${index + 1}`}</span>
                          {createdAtLabel && (
                            <span className="muted position-inline-meta">{`${createdAtLabel} 생성됨`}</span>
                          )}
                        </div>
                      </div>
                      <strong className="generated-wallet-address mono">{record.borrowerWallet}</strong>
                      <div className="position-metric-grid">
                        <div className="position-metric-card position-metric-wide">
                          <span className="position-metric-label">예치</span>
                          <strong className="position-metric-value">
                            {formatEther(BigInt(snapshot?.collateral ?? record.collateral))} ETH
                          </strong>
                        </div>
                        <div className="position-metric-card">
                          <span className="position-metric-label">현재 LTV</span>
                          <strong className="position-metric-value">
                            {(snapshot?.currentLtvBps ?? record.currentLtvBps)} bps
                          </strong>
                        </div>
                        <div className="position-metric-card">
                          <span className="position-metric-label">LT</span>
                          <strong className="position-metric-value">
                            {(snapshot?.liquidationLtvBps ?? record.liquidationLtvBps)} bps
                          </strong>
                        </div>
                      </div>
                      <div className="all-position-card-footer">
                        <span />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted">아직 저장된 포지션이 없습니다.</p>
            )}
          </div>
        )}
          </div>
        </section>

        {activeTab !== "allPositions" && activeTab !== "home" && <aside className="loan-rail">
          <section className="card floating-panel">
            <div className="side-block">
              <h3 className="section-title">내 포지션</h3>
              {dbSplitWallets.length > 0 ? (
                <div className="generated-wallet-grid position-card-list">
                  {sortedPositionWallets.map((wallet) => {
                    const index = getBorrowerIndex(wallet);
                    const snapshot = positionSnapshots[wallet];
                    const createdAtLabel = formatCreatedAtLabel(positionCreatedAts[wallet]);
                    const updatedAtLabel = formatCreatedAtLabel(positionUpdatedAts[wallet]);
                    const positionNearLiquidation = snapshot
                      ? BigInt(snapshot.liquidationLtvBps) >= BigInt(snapshot.currentLtvBps) &&
                        BigInt(snapshot.liquidationLtvBps) - BigInt(snapshot.currentLtvBps) <= 50n
                      : false;
                    const borrowCapacityExhausted = snapshot
                      ? BigInt(snapshot.availableBorrow) === 0n && BigInt(snapshot.debt) > 0n
                      : false;
                    return (
                      <div
                        className={
                          address && wallet.toLowerCase() === address.toLowerCase()
                            ? "generated-wallet-card position-card-connected"
                            : "generated-wallet-card"
                        }
                        key={wallet}
                      >
                        <div className="position-card-head">
                          <div className="position-head-meta">
                            <span className="generated-wallet-tag">{`B${index + 1}`}</span>
                            {createdAtLabel && (
                              <span className="muted position-inline-meta">{`${createdAtLabel} 생성됨`}</span>
                            )}
                          </div>
                          {borrowCapacityExhausted && (
                            <span className="position-pill position-pill-danger">한도 소진</span>
                          )}
                        </div>
                        <strong className="generated-wallet-address mono">{wallet}</strong>
                        {snapshot && (
                          <div className="position-metric-grid">
                            <div className="position-metric-card position-metric-wide">
                              <span className="position-metric-label">예치</span>
                              <strong className="position-metric-value">
                                {formatEther(BigInt(snapshot.collateral))} ETH
                              </strong>
                            </div>
                            <div className="position-metric-card">
                              <span className="position-metric-label">현재 부채</span>
                              <strong className="position-metric-value">
                                {formatEther(BigInt(snapshot.debt))} sDAI
                              </strong>
                            </div>
                            <div
                              className={
                                BigInt(snapshot.availableBorrow) === 0n
                                  ? "position-metric-card position-metric-muted"
                                  : "position-metric-card"
                              }
                            >
                              <span className="position-metric-label">추가 대출 가능</span>
                              <strong className="position-metric-value">
                                {formatEther(BigInt(snapshot.availableBorrow))} sDAI
                              </strong>
                            </div>
                            <div className="position-metric-card">
                              <span className="position-metric-label">현재 LTV</span>
                              <strong className="position-metric-value">
                                {snapshot.currentLtvBps} bps
                              </strong>
                            </div>
                            <div className="position-metric-card">
                              <span className="position-metric-label">LT</span>
                              <strong className="position-metric-value">
                                {snapshot.liquidationLtvBps} bps
                              </strong>
                            </div>
                          </div>
                        )}
                        {!snapshot && <span className="muted position-card-status">로딩 중...</span>}
                        {positionNearLiquidation && (
                          <div className="position-warning-card">
                            <span className="position-warning-label">청산 위험 경고</span>
                            <strong className="position-warning-value">LT에 매우 가깝습니다</strong>
                          </div>
                        )}
                        {updatedAtLabel && (
                          <div className="position-meta-grid">
                            <span className="muted position-inline-meta">{`${updatedAtLabel} 변경`}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="muted">지갑 연결시 계좌별 포지션이 표시됩니다.</p>
              )}
            </div>
          </section>

          {showWalletInfoModal && (
            <div className="wallet-modal-backdrop" onClick={() => setShowWalletInfoModal(false)}>
              <div className="wallet-modal-card" onClick={(event) => event.stopPropagation()}>
                <div className="wallet-modal-head">
                  <div className="warning-wallet-row">
                    <span className="generated-wallet-tag">
                      {selectedBorrowerIndex >= 0 ? `B${selectedBorrowerIndex + 1}` : "B"}
                    </span>
                    <strong className="generated-wallet-address mono">
                      {actionBorrowerWallet || "선택된 B 지갑이 없습니다."}
                    </strong>
                  </div>
                  <button
                    className="icon-copy-button"
                    type="button"
                    onClick={() => setShowWalletInfoModal(false)}
                    title="닫기"
                    aria-label="닫기"
                  >
                    ×
                  </button>
                </div>

                <div className="wallet-secret-box">
                  <span className="summary-label">Private Key</span>
                  <div className="wallet-secret-row">
                    <strong className="wallet-secret-value mono">{maskedPrivateKey}</strong>
                    <button
                      className="icon-copy-button"
                      type="button"
                      onClick={copySelectedBorrowerPrivateKey}
                      title="private key 복사"
                      aria-label="private key 복사"
                      disabled={!selectedGeneratedWallet}
                    >
                      ⧉
                    </button>
                  </div>
                  <p className="muted wallet-secret-copy">
                    {selectedGeneratedWallet
                      ? "복사 후 메타마스크에 가져오면 선택한 B 지갑으로 전환할 수 있습니다."
                      : "현재 브라우저 세션에서 생성한 B 지갑이 아니라 private key를 표시할 수 없습니다."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {showAddAccountGuideModal && (
            <div className="wallet-modal-backdrop" onClick={() => setShowAddAccountGuideModal(false)}>
              <div className="wallet-modal-card" onClick={(event) => event.stopPropagation()}>
                <div className="wallet-modal-head">
                  <div className="warning-wallet-row">
                    <span className="generated-wallet-tag">
                      {selectedBorrowerIndex >= 0 ? `B${selectedBorrowerIndex + 1}` : "B"}
                    </span>
                    <strong className="generated-wallet-address mono">
                      {actionBorrowerWallet || "선택된 B 지갑이 없습니다."}
                    </strong>
                  </div>
                  <button
                    className="icon-copy-button"
                    type="button"
                    onClick={() => setShowAddAccountGuideModal(false)}
                    title="닫기"
                    aria-label="닫기"
                  >
                    ×
                  </button>
                </div>

                <div className="wallet-secret-box">
                  <span className="summary-label">메타마스크 추가 순서</span>
                  <ol className="wallet-guide-list">
                    <li>먼저 `B 지갑 정보 보기`에서 private key를 복사합니다.</li>
                    <li>메타마스크에서 `지갑 추가`로 이동하고 `계정 가져오기`를 누릅니다.</li>
                    <li>복사한 private key를 붙여넣고 B 계정을 추가합니다.</li>
                  </ol>
                  <div className="actions actions-right">
                    <button
                      className="secondary"
                      type="button"
                      onClick={markSelectedWalletAdded}
                    >
                      추가 완료
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </aside>}
      </div>
    </section>
  );
}
