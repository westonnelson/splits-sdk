import React, { useCallback } from 'react'
import { useCreateSplit } from '@0xsplits/splits-sdk-react'
import { CreateSplitConfig } from '@0xsplits/splits-sdk'
import { useForm, FormProvider } from 'react-hook-form'
import type { Event } from '@ethersproject/contracts'
import { useAccount, useNetwork } from 'wagmi'
import { sum, uniq } from 'lodash'

import { ControllerSelector } from '../CreateSplit/ControllerSelector'
import RecipientSetter from '../CreateSplit/RecipientSetter'
import NumberSelectInput from '../inputs/NumberSelectInput'
import { IAddress, Recipient, CreateSplitForm } from '../../types'
import Disclaimer from '../CreateSplit/Disclaimer'
import InputRow from '../inputs/InputRow'
import { CHAIN_INFO, SupportedChainId } from '../../constants/chains'
import Tooltip from '../util/Tooltip'
import Button from '../util/Button'
import Link from '../util/Link'
import { getSplitRouterParams } from '../../utils/splits'
import { getNativeTokenSymbol } from '../../utils/display'

const CreateCreateSplitForm = ({
  chainId,
  defaultDistributorFee,
  defaultRecipients,
  defaultController,
  defaultDistributorFeeOptions,
  onSuccess,
}: {
  chainId: SupportedChainId
  defaultDistributorFee: number
  defaultController: IAddress
  defaultRecipients: Recipient[]
  defaultDistributorFeeOptions: number[]
  onSuccess?: (address: string, event: Event | undefined) => void
}) => {
  const { createSplit } = useCreateSplit()
  const { isConnected, address: connectedAddress } = useAccount()
  const { chain } = useNetwork()

  const form = useForm<CreateSplitForm>({
    mode: 'onChange',
    defaultValues: {
      recipients: defaultRecipients,
      controller: defaultController,
      distributorFee: defaultDistributorFee,
    },
  })

  const {
    handleSubmit,
    control,
    watch,
    setValue,
    setError,
    formState: { isValid: isFormValid },
  } = form

  const onSubmit = useCallback(
    async (data: CreateSplitForm) => {
      const args: CreateSplitConfig = {
        recipients: data.recipients,
        distributorFeePercent: data.distributorFee,
        controller: data.controller,
      }
      const result = await createSplit(args)
      if (result) {
        const event = result?.[0]
        const splitId = event?.args?.split
        onSuccess && onSuccess(splitId, event)
      }
    },
    [createSplit, onSuccess],
  )

  const recipientAllocationTotal = sum(
    watch('recipients').map((recipient) => recipient.percentAllocation),
  )

  const isFullyAllocated = recipientAllocationTotal === 100
  const isWrongChain = chain && chainId !== chain.id
  const isButtonDisabled =
    !isConnected || isWrongChain || !isFormValid || !isFullyAllocated

  const formData = watch()
  const createOnSplitsAppLink = `https://app.splits.org/new/split?${getSplitRouterParams(
    formData,
    connectedAddress,
  )}`

  return (
    <div className="space-y-8 flex flex-col">
      <FormProvider {...form}>
        <div className="leading-relaxed text-gray-500">
          Split is a payable smart contract that splits all incoming{' '}
          {getNativeTokenSymbol(chainId)} & ERC20 tokens among the recipients
          according to predefined ownership shares.{' '}
          <Link
            href="https://docs.splits.org/core/split"
            className="underline transition hover:opacity-80"
          >
            Learn more
          </Link>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          <RecipientSetter chainId={chainId} />
          <InputRow
            label="Controller"
            input={
              <ControllerSelector
                chainId={chainId}
                control={control}
                inputName={'controller'}
                setValue={setValue}
                setError={setError}
              />
            }
            link="https://docs.splits.org/create#split"
          />
          <InputRow
            label="Distributor Fee"
            input={
              <NumberSelectInput
                control={control}
                inputName={'distributorFee'}
                defaultVal={defaultDistributorFee}
                setValue={setValue}
                options={uniq([
                  ...defaultDistributorFeeOptions,
                  defaultDistributorFee,
                ])
                  .sort()
                  .map((value) => {
                    return {
                      value,
                      display: () => <span>{value}%</span>,
                    }
                  })
                  .concat([
                    {
                      value: 0,
                      display: () => <span>Manually distribute (0%)</span>,
                    },
                  ])}
                placeholder={`${defaultDistributorFee}%`}
                decimalScale={2}
                suffix={`%`}
                minVal={0.01}
                maxVal={99.99}
                hideSelectedValue={false}
              />
            }
            link="https://docs.splits.org/distribute#distribution-bounty"
          />
          <div className="my-5 flex flex-col space-y-1 text-center">
            <Tooltip
              isDisabled={isConnected && !isWrongChain}
              content={
                isWrongChain
                  ? `Switch to ${CHAIN_INFO[chainId].label} to distribute funds`
                  : !isConnected
                  ? 'Connect wallect'
                  : ''
              }
            >
              <Button type="submit" isDisabled={isButtonDisabled}>
                Create Split
              </Button>
            </Tooltip>
            <span className="text-gray-400">or</span>
            <div>
              <Link
                href={createOnSplitsAppLink}
                className="font-medium text-gray-500 dark:text-gray-300"
              >
                Create on app.splits.org
              </Link>
            </div>
          </div>
        </form>
        <Disclaimer />
      </FormProvider>
    </div>
  )
}

export default CreateCreateSplitForm
