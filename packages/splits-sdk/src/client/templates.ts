import { Interface } from '@ethersproject/abi'
import { BigNumber } from '@ethersproject/bignumber'
import { AddressZero } from '@ethersproject/constants'
import { ContractTransaction, Event } from '@ethersproject/contracts'

import RECOUP_ARTIFACT from '../artifacts/contracts/Recoup/Recoup.json'

import { BaseTransactions } from './base'
import {
  TransactionType,
  getRecoupAddress,
  TEMPLATES_CHAIN_IDS,
} from '../constants'
import { TransactionFailedError, UnsupportedChainIdError } from '../errors'
import type {
  CallData,
  CreateRecoupConfig,
  SplitsClientConfig,
  TransactionConfig,
  TransactionFormat,
} from '../types'
import { getTransactionEvents, getRecoupTranchesAndSizes } from '../utils'
import {
  validateAddress,
  validateRecoupNonWaterfallRecipient,
  validateRecoupTranches,
} from '../utils/validation'
import type { Recoup as RecoupType } from '../typechain/Recoup'
import { ContractCallData } from '../utils/multicall'

const recoupInterface = new Interface(RECOUP_ARTIFACT.abi)

class TemplatesTransactions extends BaseTransactions {
  private readonly _recoupContract:
    | ContractCallData
    | RecoupType
    | RecoupType['estimateGas']

  constructor({
    transactionType,
    chainId,
    provider,
    ensProvider,
    signer,
    includeEnsNames = false,
  }: SplitsClientConfig & TransactionConfig) {
    super({
      transactionType,
      chainId,
      provider,
      ensProvider,
      signer,
      includeEnsNames,
    })

    this._recoupContract = this._getRecoupContract()
  }

  protected async _createRecoupTransaction({
    token,
    tranches,
    nonWaterfallRecipientAddress = AddressZero,
    nonWaterfallRecipientTrancheIndex = undefined,
  }: CreateRecoupConfig): Promise<TransactionFormat> {
    validateAddress(token)
    validateAddress(nonWaterfallRecipientAddress)
    validateRecoupTranches(tranches)
    validateRecoupNonWaterfallRecipient(
      tranches.length,
      nonWaterfallRecipientAddress,
      nonWaterfallRecipientTrancheIndex,
    )

    this._requireProvider()
    if (!this._provider) throw new Error('Provider required')
    if (this._shouldRequireSigner) this._requireSigner()

    const [recoupTranches, trancheSizes] = await getRecoupTranchesAndSizes(
      this._chainId,
      token,
      tranches,
      this._provider,
    )

    const createRecoupResult = await this._recoupContract.createRecoup(
      token,
      nonWaterfallRecipientAddress,
      nonWaterfallRecipientTrancheIndex,
      recoupTranches,
      trancheSizes,
    )

    return createRecoupResult
  }

  private _getRecoupContract() {
    return this._getTransactionContract<RecoupType, RecoupType['estimateGas']>(
      getRecoupAddress(this._chainId),
      RECOUP_ARTIFACT.abi,
      recoupInterface,
    )
  }
}

export default class TemplatesClient extends TemplatesTransactions {
  readonly eventTopics: { [key: string]: string[] }
  readonly callData: TemplatesCallData
  readonly estimateGas: TemplatesGasEstimates

  constructor({
    chainId,
    provider,
    ensProvider,
    signer,
    includeEnsNames = false,
  }: SplitsClientConfig) {
    super({
      transactionType: TransactionType.Transaction,
      chainId,
      provider,
      ensProvider,
      signer,
      includeEnsNames,
    })

    if (!TEMPLATES_CHAIN_IDS.includes(chainId))
      throw new UnsupportedChainIdError(chainId, TEMPLATES_CHAIN_IDS)

    this.eventTopics = {
      // TODO: add others here? create waterfall, create split, etc.
      createRecoup: [recoupInterface.getEventTopic('CreateRecoup')],
    }

    this.callData = new TemplatesCallData({
      chainId,
      provider,
      ensProvider,
      signer,
      includeEnsNames,
    })
    this.estimateGas = new TemplatesGasEstimates({
      chainId,
      provider,
      ensProvider,
      signer,
      includeEnsNames,
    })
  }

  // Write actions
  async submitCreateRecoupTransaction({
    token,
    tranches,
    nonWaterfallRecipientAddress = AddressZero,
    nonWaterfallRecipientTrancheIndex = undefined,
  }: CreateRecoupConfig): Promise<{
    tx: ContractTransaction
  }> {
    const createRecoupTx = await this._createRecoupTransaction({
      token,
      tranches,
      nonWaterfallRecipientAddress,
      nonWaterfallRecipientTrancheIndex,
    })
    if (!this._isContractTransaction(createRecoupTx))
      throw new Error('Invalid response')

    return { tx: createRecoupTx }
  }

  async createRecoup({
    token,
    tranches,
    nonWaterfallRecipientAddress = AddressZero,
    nonWaterfallRecipientTrancheIndex = undefined,
  }: CreateRecoupConfig): Promise<{
    waterfallModuleId: string
    event: Event
  }> {
    const { tx: createRecoupTx } = await this.submitCreateRecoupTransaction({
      token,
      tranches,
      nonWaterfallRecipientAddress,
      nonWaterfallRecipientTrancheIndex,
    })
    const events = await getTransactionEvents(
      createRecoupTx,
      this.eventTopics.createRecoup,
    )
    const event = events.length > 0 ? events[0] : undefined
    if (event && event.args)
      return {
        waterfallModuleId: event.args.waterfallModule,
        event,
      }

    throw new TransactionFailedError()
  }
}

class TemplatesGasEstimates extends TemplatesTransactions {
  constructor({
    chainId,
    provider,
    ensProvider,
    signer,
    includeEnsNames = false,
  }: SplitsClientConfig) {
    super({
      transactionType: TransactionType.GasEstimate,
      chainId,
      provider,
      ensProvider,
      signer,
      includeEnsNames,
    })
  }

  async createRecoup({
    token,
    tranches,
    nonWaterfallRecipientAddress = AddressZero,
    nonWaterfallRecipientTrancheIndex = undefined,
  }: CreateRecoupConfig): Promise<BigNumber> {
    const gasEstimate = await this._createRecoupTransaction({
      token,
      tranches,
      nonWaterfallRecipientAddress,
      nonWaterfallRecipientTrancheIndex,
    })
    if (!this._isBigNumber(gasEstimate)) throw new Error('Invalid response')

    return gasEstimate
  }
}

class TemplatesCallData extends TemplatesTransactions {
  constructor({
    chainId,
    provider,
    ensProvider,
    signer,
    includeEnsNames = false,
  }: SplitsClientConfig) {
    super({
      transactionType: TransactionType.CallData,
      chainId,
      provider,
      ensProvider,
      signer,
      includeEnsNames,
    })
  }

  async createRecoup({
    token,
    tranches,
    nonWaterfallRecipientAddress = AddressZero,
    nonWaterfallRecipientTrancheIndex = undefined,
  }: CreateRecoupConfig): Promise<CallData> {
    const callData = await this._createRecoupTransaction({
      token,
      tranches,
      nonWaterfallRecipientAddress,
      nonWaterfallRecipientTrancheIndex,
    })
    if (!this._isCallData(callData)) throw new Error('Invalid response')

    return callData
  }
}