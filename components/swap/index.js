import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'
import { useSelector, useDispatch, shallowEqual } from 'react-redux'
import _ from 'lodash'
import moment from 'moment'
import { BigNumber, Contract, FixedNumber, constants, utils } from 'ethers'
import { TailSpin, Watch, Oval } from 'react-loader-spinner'
import { DebounceInput } from 'react-debounce-input'
import { Tooltip } from '@material-tailwind/react'
import { TiArrowRight } from 'react-icons/ti'
import { MdClose } from 'react-icons/md'
import { HiSwitchVertical } from 'react-icons/hi'
import { BiMessageError, BiMessageCheck, BiMessageDetail, BiEditAlt, BiCheckCircle, BiInfoCircle } from 'react-icons/bi'
import { IoWarning } from 'react-icons/io5'

import Options from './options'
import SelectChain from '../select/chain'
import SelectAsset from '../select/asset'
import Balance from '../balance'
import Image from '../image'
import Wallet from '../wallet'
import Alert from '../alerts'
import Copy from '../copy'
import DecimalsFormat from '../decimals-format'
import { params_to_obj, number_format, number_to_fixed, ellipse, equals_ignore_case, loader_color, sleep, error_patterns } from '../../lib/utils'
import { POOLS_DATA, BALANCES_DATA } from '../../reducers/types'

const WRAPPED_PREFIX =
  process.env.NEXT_PUBLIC_WRAPPED_PREFIX ||
  'next'

const GAS_LIMIT_ADJUSTMENT =
  Number(
    process.env.NEXT_PUBLIC_GAS_LIMIT_ADJUSTMENT
  ) ||
  1

const DEFAULT_SWAP_SLIPPAGE_PERCENTAGE =
  Number(
    process.env.NEXT_PUBLIC_DEFAULT_SWAP_SLIPPAGE_PERCENTAGE
  ) ||
  3

const DEFAULT_OPTIONS = {
  infiniteApprove: true,
  slippage: DEFAULT_SWAP_SLIPPAGE_PERCENTAGE,
}

export default () => {
  const dispatch = useDispatch()
  const {
    preferences,
    chains,
    assets,
    pool_assets,
    pools,
    rpc_providers,
    dev,
    wallet,
    balances,
  } = useSelector(state =>
    (
      {
        preferences: state.preferences,
        chains: state.chains,
        assets: state.assets,
        pool_assets: state.pool_assets,
        pools: state.pools,
        rpc_providers: state.rpc_providers,
        dev: state.dev,
        wallet: state.wallet,
        balances: state.balances,
      }
    ),
    shallowEqual,
  )
  const {
    theme,
    page_visible,
  } = { ...preferences }
  const {
    chains_data,
  } = { ...chains }
  const {
    assets_data,
  } = { ...assets }
  const {
    pool_assets_data,
  } = { ...pool_assets }
  const {
    pools_data,
  } = { ...pools }
  const {
    rpcs,
  } = { ...rpc_providers }
  const {
    sdk,
  } = { ...dev }
  const {
    wallet_data,
  } = { ...wallet }
  const {
    provider,
    web3_provider,
    address,
    signer,
  } = { ...wallet_data }
  const {
    balances_data,
  } = { ...balances }

  const wallet_chain_id = wallet_data?.chain_id

  const router = useRouter()
  const {
    asPath,
  } = { ...router }

  const [swap, setSwap] = useState({})
  const [options, setOptions] = useState(DEFAULT_OPTIONS)
  const [buttonDirection, setButtonDirection] = useState(1)
  const [slippageEditing, setSlippageEditing] = useState(false)

  const [swapAmount, setSwapAmount] = useState(null)
  const [calculateSwapResponse, setCalculateSwapResponse] = useState(null)
  const [priceImpact, setPriceImpact] = useState(null)

  const [approving, setApproving] = useState(null)
  const [approveProcessing, setApproveProcessing] = useState(null)
  const [approveResponse, setApproveResponse] = useState(null)

  const [calling, setCalling] = useState(null)
  const [callProcessing, setCallProcessing] = useState(null)
  const [callResponse, setCallResponse] = useState(null)

  const [pair, setPair] = useState(null)
  const [pairTrigger, setPairTrigger] = useState(null)
  const [balanceTrigger, setBalanceTrigger] = useState(null)

  // get swap from path
  useEffect(
    () => {
      let updated = false

      const params =
        params_to_obj(
          asPath?.indexOf('?') > -1 &&
          asPath.substring(
            asPath.indexOf('?') + 1,
          )
        )

      const {
        amount,
        from,
      } = { ...params }

      let path =
        !asPath ?
          '/' :
          asPath.toLowerCase()

      path =
        path.includes('?') ?
          path.substring(
            0,
            path.indexOf('?'),
          ) :
          path

      if (path.includes('on-')) {
        const paths =
          path
            .replace(
              '/swap/',
              '',
            )
            .split('-')

        const chain = paths[paths.indexOf('on') + 1]
        const asset =
          _.head(paths) !== 'on' ?
            _.head(paths) :
            process.env.NEXT_PUBLIC_NETWORK === 'testnet' ?
              'eth' :
              'usdc'

        const chain_data = (chains_data || [])
          .filter(c => !c?.no_pool)
          .find(c =>
            c?.id === chain
          )

        const asset_data = (pool_assets_data || [])
          .find(a =>
            a?.id === asset ||
            equals_ignore_case(
              a?.symbol,
              asset,
            )
          )

        if (chain_data) {
          swap.chain = chain
          updated = true
        }

        if (asset_data) {
          swap.asset = asset
          updated = true
        }

        if (swap.chain) {
          if (
            !isNaN(amount) &&
            Number(amount) > 0
          ) {
            swap.amount = amount
            updated = true
          }

          if (from) {
            swap.origin = 'y'
            updated = true
          }
        }
      }

      if (
        (
          !path.includes('on-') ||
          !swap.chain
        ) &&
        !path.includes('[swap]') &&
        (chains_data || [])
          .filter(c => !c?.no_pool)
          .length > 0
      ) {
        const _chain =
          _.head(
            chains_data
              .filter(c => !c?.no_pool)
              .map(c => c?.id)
          )

        router
          .push(
            `/swap/on-${_chain}${
              Object.keys(params).length > 0 ?
                `?${
                  new URLSearchParams(params)
                    .toString()
                }` :
                ''
            }`,
            undefined,
            {
              shallow: true,
            },
          )
      }

      if (updated) {
        setSwap(swap)
      }
    },
    [asPath, chains_data, pool_assets_data],
  )

  // set swap to path
  useEffect(
    () => {
      const params = {}

      if (swap) {
        const {
          chain,
          asset,
          amount,
          origin,
        } = { ...swap }

        if (
          (chains_data || [])
            .findIndex(c =>
              !c?.disabled &&
              !c?.no_pool &&
              c?.id === chain
            ) > -1
        ) {
          params.chain = chain

          if (
            asset &&
            (pool_assets_data || [])
              .findIndex(a =>
                a?.id === asset &&
                (a.contracts || [])
                  .findIndex(c =>
                    c?.chain_id ===
                    chains_data
                      .find(_c =>
                        _c?.id === chain
                      )?.chain_id
                  ) > -1
              ) > -1
          ) {
            params.asset = asset
          }
        }

        if (
          params.chain &&
          params.asset
        ) {
          if (
            !isNaN(amount) &&
            Number(amount) > 0
          ) {
            params.amount = amount
          }

          if (
            origin === 'y' &&
            local?.symbol &&
            (pool_assets_data || [])
              .findIndex(a =>
                a?.id === asset &&
                (a.contracts || [])
                  .findIndex(c =>
                    c?.chain_id ===
                    chains_data
                      .find(_c =>
                        _c?.id === chain
                      )?.chain_id &&
                    [
                      a?.symbol,
                      c?.symbol,
                      c?.next_asset?.symbol,
                    ]
                    .findIndex(s =>
                      equals_ignore_case(
                        s,
                        local.symbol,
                      )
                    ) > -1
                  ) > -1
              ) > -1
          ) {
            params.from = local.symbol
          }
        }
      }

      if (Object.keys(params).length > 0) {
        const {
          chain,
          asset,
        } = { ...params }

        delete params.chain
        delete params.asset

        router
          .push(
            `/swap/${
              chain ?
                `${
                  asset ?
                    `${asset.toUpperCase()}-` :
                    ''
                }on-${chain}` :
                ''
            }${
              Object.keys(params).length > 0 ?
                `?${
                  new URLSearchParams(params)
                    .toString()
                }` :
                ''
            }`,
            undefined,
            {
              shallow: true,
            },
          )

        setBalanceTrigger(
          moment()
            .valueOf()
        )
      }

      setApproveResponse(null)
      setCallResponse(null)
    },
    [address, swap],
  )

  // update balances
  useEffect(
    () => {
      let {
        chain,
      } = { ...swap }

      const chain_data = (chains_data || [])
        .find(c =>
          c?.chain_id === wallet_chain_id
        )

      const {
        id,
      } = { ...chain_data }

      if (
        asPath &&
        id
      ) {
        const params =
          params_to_obj(
            asPath.indexOf('?') > -1 &&
            asPath.substring(
              asPath.indexOf('?') + 1,
            )
          )

        if (
          !chain &&
          !params?.chain &&
          (chains_data || [])
            .findIndex(c =>
              !c?.disabled &&
              c?.id === id
            ) > -1
        ) {
          chain = id
        }

        getBalances(id)
      }

      if (Object.keys(swap).length > 0) {
        chain =
          chain ||
          _.head(
            (chains_data || [])
              .filter(c =>
                !c?.disabled &&
                (pool_assets_data || [])
                  .findIndex(a =>
                    (a?.contracts || [])
                      .findIndex(_c =>
                        _c?.chain_id === c?.chain_id
                      ) > -1
                  ) > -1
              )
          )?.id
      }

      setSwap(
        {
          ...swap,
          chain,
        }
      )
    },
    [asPath, wallet_chain_id, chains_data],
  )

  // update balances
  useEffect(
    () => {
      dispatch(
        {
          type: BALANCES_DATA,
          value: null,
        }
      )

      if (address) {
        const {
          chain,
        } = { ...swap }

        getBalances(chain)
      }
      else {
        reset('address')
      }
    },
    [address],
  )

  // update balances
  useEffect(
    () => {
      const getData = () => {
        const {
          status,
        } = { ...approveResponse }

        if (
          page_visible &&
          address &&
          !calling &&
          ![
            'pending',
          ]
          .includes(status)
        ) {
          const {
            chain,
          } = { ...swap }

          getBalances(chain)
        }
      }

      getData()

      const interval =
        setInterval(
          () =>
            getData(),
          0.25 * 60 * 1000,
        )

      return () => clearInterval(interval)
    },
    [page_visible, rpcs],
  )

  // update balances
  useEffect(
    () => {
      if (pools_data) {
        const chains =
          _.uniq(
            pools_data
              .map(p => p?.chain_data?.id)
              .filter(c => c)
          )

        chains
          .forEach(c =>
            getBalances(c)
          )
      }
    },
    [pools_data],
  )

  // get pair
  useEffect(
    () => {
      const getData = async () => {
        const {
          chain,
          asset,
          amount,
        } = { ...swap }

        let failed,
          _pair

        if (
          sdk &&
          chain
        ) {
          if (
            [
              'string',
              'number',
            ]
            .includes(typeof amount) &&
            ![
              '',
            ]
            .includes(swapAmount)
          ) {
            setSwapAmount(true)
          }
          else if (
            [
              'string',
              'number',
            ]
            .includes(typeof swapAmount) &&
            ![
              '',
            ]
            .includes(swapAmount)
          ) {
            setSwapAmount(null)
          }

          const chain_changed =
            !equals_ignore_case(
              chain,
              pair?.chain_data?.id,
            )

          const asset_changed =
            !equals_ignore_case(
              asset,
              pair?.asset_data?.id,
            )

          if (
            chain_changed ||
            asset_changed ||
            !pair?.updated_at ||
            moment()
              .diff(
                moment(pair.updated_at),
                'seconds',
              ) > 30
          ) {
            try {
              const {
                chain,
                asset,
                amount,
              } = { ...swap }

              if (
                pair === undefined ||
                pair?.error ||
                chain_changed ||
                asset_changed
              ) {
                setPair(
                  (pools_data || [])
                    .find(p =>
                      equals_ignore_case(
                        p?.id,
                        `${chain}_${asset}`,
                      )
                    ) ||
                    null
                )
              }

              const chain_data = chains_data
                .find(c =>
                  c?.id === chain
                )

              const {
                chain_id,
                domain_id,
              } = { ...chain_data }

              const asset_data = pool_assets_data
                .find(a =>
                  a?.id === asset
                )

              const {
                contracts,
              } = { ...asset_data }

              const contract_data = (contracts || [])
                .find(c =>
                  c?.chain_id === chain_id
                )

              const {
                contract_address,
                is_pool,
              } = { ...contract_data }

              const pool =
                is_pool &&
                _.cloneDeep(
                  await sdk.sdkPool
                    .getPool(
                      domain_id,
                      contract_address,
                    )
                )

              const {
                lpTokenAddress,
                adopted,
                local,
              } = { ...pool }

              if (adopted) {
                const {
                  balance,
                  decimals,
                } = { ...adopted }

                adopted.balance =
                  utils.formatUnits(
                    BigNumber.from(
                      balance ||
                      '0'
                    ),
                    decimals ||
                    18,
                  )

                pool.adopted = adopted
              }

              if (local) {
                const {
                  balance,
                  decimals,
                } = { ...local }

                local.balance =
                  utils.formatUnits(
                    BigNumber.from(
                      balance ||
                      '0'
                    ),
                    decimals ||
                    18,
                  )

                pool.local = local
              }

              let supply

              if (lpTokenAddress) {
                console.log(
                  '[getTokenSupply]',
                  {
                    domain_id,
                    lpTokenAddress,
                  },
                )

                try {
                  supply =
                    await sdk.sdkPool
                      .getTokenSupply(
                        domain_id,
                        lpTokenAddress,
                      )

                  supply =
                    utils.formatUnits(
                      BigNumber.from(
                        supply
                      ),
                      18,
                    )

                  console.log(
                    '[LPTokenSupply]',
                    {
                      domain_id,
                      lpTokenAddress,
                      supply,
                    },
                  )
                } catch (error) {
                  console.log(
                    '[getTokenSupply error]',
                    {
                      domain_id,
                      lpTokenAddress,
                    },
                    error,
                  )
                }
              }

              let rate

              if (pool) {
                console.log(
                  '[getVirtualPrice]',
                  {
                    domain_id,
                    contract_address,
                  },
                )

                try {
                  rate =
                    await sdk.sdkPool
                      .getVirtualPrice(
                        domain_id,
                        contract_address,
                      )

                  rate =
                    Number(
                      utils.formatUnits(
                        BigNumber.from(
                          rate ||
                          '0'
                        ),
                        18,
                      )
                    )

                  console.log(
                    '[virtualPrice]',
                    {
                      domain_id,
                      contract_address,
                      rate,
                    },
                  )
                } catch (error) {
                  console.log(
                    '[getVirtualPrice error]',
                    {
                      domain_id,
                      contract_address,
                    },
                    error,
                  )
                }
              }

              let tvl

              if (
                [
                  'string',
                  'number',
                ]
                .includes(typeof supply) ||
                (
                  adopted?.balance &&
                  local?.balance
                )
              ) {
                const {
                  price,
                } = {
                  ...(
                    (assets_data || [])
                      .find(a =>
                        a?.id === asset_data.id
                      )
                  ),
                }

                tvl =
                  typeof price === 'number' ?
                    (
                      supply ||
                      _.sum(
                        [
                          adopted,
                          local,
                        ]
                        .filter(t => t)
                        .map(t => {
                          const {
                            balance,
                            index,
                          } = { ...t }

                          return (
                            Number(
                              balance ||
                              '0'
                            ) /
                            (
                              index > 0 &&
                              rate > 0 ?
                                rate :
                                1
                            )
                          )
                        })
                      )
                    ) *
                    price :
                    0
              }

              _pair =
                (
                  pool ?
                    [
                      pool,
                    ]
                    .map(p => {
                      let {
                        name,
                        symbol,
                      } = { ...p }

                      if (symbol?.includes(`${WRAPPED_PREFIX}${WRAPPED_PREFIX}`)) {
                        name =
                          (name || '')
                            .replace(
                              WRAPPED_PREFIX,
                              '',
                            )

                        symbol =
                          symbol
                            .split('-')
                            .map(s =>
                              s
                                .replace(
                                  WRAPPED_PREFIX,
                                  '',
                                )
                            )
                            .join('-')

                        pool.name = name
                        pool.symbol = symbol
                      }

                      if (symbol?.includes('-')) {
                        const symbols =
                          symbol
                            .split('-')

                        if (
                          equals_ignore_case(
                            _.head(symbols),
                            _.last(symbols),
                          ) &&
                          adopted?.symbol &&
                          local?.symbol
                        ) {
                          symbol =
                            [
                              adopted.symbol,
                              local.symbol,
                            ]
                            .join('-')

                          pool.symbol = symbol
                        }
                      }

                      const symbols =
                        (symbol || '')
                          .split('-')
                          .filter(s => s)

                      const asset_data = pool_assets_data
                        .find(a =>
                          symbols
                            .findIndex(s =>
                              equals_ignore_case(
                                s,
                                a?.symbol,
                              )
                            ) > -1 ||
                          (a?.contracts || [])
                            .findIndex(c =>
                              c?.chain_id === chain_id &&
                              symbols
                                .findIndex(s =>
                                  equals_ignore_case(
                                    s,
                                    c?.symbol,
                                  )
                                ) > -1
                            ) > -1
                        )

                      return {
                        ...p,
                        chain_data,
                        asset_data,
                        symbols,
                      }
                    }) :
                    [
                      pair,
                    ]
                )
                .find(p =>
                  equals_ignore_case(
                    p?.domainId,
                    domain_id,
                  ) &&
                  equals_ignore_case(
                    p?.asset_data?.id,
                    asset,
                  )
                )

              _pair =
                _pair &&
                {
                  ..._pair,
                  id: `${chain}_${asset}`,
                  contract_data,
                  supply:
                    supply ||
                    _pair.supply,
                  rate,
                  tvl,
                  updated_at:
                    moment()
                      .valueOf(),
                }

              setPair(
                is_pool ?
                  _pair :
                  undefined
              )

              if (
                is_pool &&
                _pair
              ) {
                dispatch(
                  {
                    type: POOLS_DATA,
                    value: _pair,
                  }
                )
              }
            } catch (error) {
              console.log(
                '[getPair error]',
                swap,
                error,
              )

              setPair(
                {
                  error,
                }
              )

              calculateSwap(null)

              failed = true
            }
          }
          else {
            _pair = pair
          }

          if (!failed) {
            calculateSwap(_pair)
          }
        }
      }

      getData()
    },
    [sdk, swap, pairTrigger],
  )

  const getBalances = chain => {
    const getBalance = async (
      chain_id,
      contract_data,
    ) => {
      const {
        contract_address,
        next_asset,
        wrapable,
      } = { ...contract_data }

      const provider = rpcs?.[chain_id]

      if (
        address &&
        provider
      ) {
        const {
          symbol,
          image,
        } = {
          ...(
            assets_data
              .find(a =>
                (a?.contracts || [])
                  .findIndex(c =>
                    c?.chain_id === chain_id &&
                    equals_ignore_case(
                      c?.contract_address,
                      contract_address,
                    )
                  ) > -1
              )
          ),
        }

        const contracts =
          _.concat(
            wrapable &&
            {
              ...contract_data,
              contract_address: constants.AddressZero,
              symbol,
              image,
            },
            {
              ...contract_data,
            },
            next_asset &&
            {
              ...contract_data,
              ...next_asset,
            },
          )
          .filter(c => c?.contract_address)

        const balances = []

        for (const contract of contracts) {
          const {
            contract_address,
            decimals,
          } = { ...contract }

          let balance

          if (contract_address === constants.AddressZero) {
            balance =
              await provider
                .getBalance(
                  address,
                )
          }
          else {
            const contract =
              new Contract(
                contract_address,
                [
                  'function balanceOf(address owner) view returns (uint256)',
                ],
                provider,
              )

            balance =
              await contract
                .balanceOf(
                  address,
                )
          }

          if (
            balance ||
            !(
              (balances_data?.[`${chain_id}`] || [])
                .findIndex(c =>
                  equals_ignore_case(
                    c?.contract_address,
                    contract_address,
                  )
                ) > -1
            )
          ) {
            balances
              .push(
                {
                  ...contract,
                  amount:
                    balance &&
                    utils.formatUnits(
                      balance,
                      decimals ||
                      18,
                    ),
                }
              )
          }
        }

        if (balances.length > 0) {
          dispatch(
            {
              type: BALANCES_DATA,
              value: {
                [`${chain_id}`]: balances,
              },
            }
          )
        }
      }
    }

    if (page_visible) {
      const {
        chain_id,
      } = {
        ...(
          (chains_data || [])
            .find(c =>
              c?.id === chain
            )
        ),
      }

      const contracts_data =
        (pool_assets_data || [])
          .map(a => {
            const {
              contracts,
            } = { ...a }

            return {
              ...a,
              ...(
                (contracts || [])
                  .find(c =>
                    c?.chain_id === chain_id
                  )
              ),
            }
          })
          .filter(a => a?.contract_address)
          .map(a => {
            const {
              next_asset,
            } = { ...a };
            let {
              contract_address,
            } = {  ...a }

            contract_address = contract_address.toLowerCase()

            if (next_asset?.contract_address) {
              next_asset.contract_address = next_asset.contract_address.toLowerCase()
            }

            return {
              ...a,
              contract_address,
              next_asset,
            }
          })

      contracts_data
        .forEach(c =>
          getBalance(
            chain_id,
            c,
          )
        )
    }
  }

  const reset = async origin => {
    const reset_swap =
      ![
        'address',
        'user_rejected',
      ]
      .includes(origin)

    if (reset_swap) {
      setSwap(
        {
          ...swap,
          amount: null,
        }
      )
    }

    setOptions(DEFAULT_OPTIONS)

    setCalculateSwapResponse(null)

    setApproving(null)
    setApproveProcessing(null)
    setApproveResponse(null)

    setCalling(null)
    setCallProcessing(null)
    setCallResponse(null)

    setPairTrigger(
      moment()
        .valueOf()
    )
    setBalanceTrigger(
      moment()
        .valueOf()
    )

    const {
      chain,
    } = { ...swap }

    getBalances(chain)
  }

  const call = async () => {
    setCalculateSwapResponse(null)
    setApproving(null)
    setCalling(true)

    let success = false

    if (sdk) {
      let {
        amount,
        origin,
      } = { ...swap }

      origin =
        origin ||
        'x'

      const {
        chain_data,
        asset_data,
        contract_data,
        domainId,
        adopted,
        local,
        symbols,
      } = { ...pair }
      const {
        contract_address,
      } = { ...contract_data }

      const x_asset_data =
        adopted?.address &&
        {
          ...(
            Object.fromEntries(
              Object.entries({ ...asset_data }).
                filter(([k, v]) =>
                  !['contracts'].includes(k)
                )
            )
          ),
          ...(
            equals_ignore_case(
              adopted.address,
              contract_address
            ) ?
              contract_data :
              {
                chain_id,
                contract_address: adopted.address,
                decimals: adopted.decimals,
                symbol: adopted.symbol,
              }
          ),
        }

      const y_asset_data =
        local?.address &&
        {
          ...(
            Object.fromEntries(
              Object.entries({ ...asset_data })
                .filter(([k, v]) =>
                  !['contracts'].includes(k)
                )
            )
          ),
          ...(
            equals_ignore_case(
              local.address,
              contract_address,
            ) ?
              contract_data :
              {
                chain_id,
                contract_address: local.address,
                decimals: local.decimals,
                symbol: local.symbol,
              }
          ),
        }

      const {
        infiniteApprove,
        slippage,
      } = { ...options }
      let {
        deadline,
      } = { ...options }

      deadline =
        deadline &&
        moment()
          .add(
            deadline,
            'minutes',
          )
          .valueOf()

      let failed = false

      const _decimals =
        (origin === 'x' ?
          x_asset_data :
          y_asset_data
        )?.decimals ||
        18

      const recv_decimals =
        (origin === 'x' ?
          y_asset_data :
          x_asset_data
        )?.decimals ||
        18

      let minDy = 0

      if (
        !amount ||
        [
          '0',
          '0.0',
          0,
        ]
        .includes(amount)
      ) {
        failed = true

        setApproving(false)
      }
      else {
        minDy =
          (
            Number(amount) *
            (
              (
                100 -
                (
                  typeof slippage === 'number' ?
                    slippage :
                    DEFAULT_SWAP_SLIPPAGE_PERCENTAGE
                )
              ) /
              100
            )
            .toFixed(recv_decimals)
          )
          .toFixed(recv_decimals)

        amount =
          utils.parseUnits(
            (
              (
                typeof amount === 'string' &&
                amount.indexOf('.') > -1 ?
                  amount
                    .substring(
                      0,
                      amount.indexOf('.') + _decimals + 1,
                    ) :
                  amount
              ) ||
              0
            )
            .toString(),
            _decimals,
          )
          .toString()
      }

      minDy =
        utils.parseUnits(
          (
            minDy ||
            0
          )
          .toString(),
          recv_decimals,
        )
        .toString()

      if (!failed) {
        try {
          const approve_request =
            await sdk.sdkBase
              .approveIfNeeded(
                domainId,
                (origin === 'x' ?
                  x_asset_data :
                  y_asset_data
                )?.contract_address,
                amount,
                infiniteApprove,
              )

          if (approve_request) {
            setApproving(true)

            const approve_response =
              await signer
                .sendTransaction(
                  approve_request,
                )

            const {
              hash,
            } = { ...approve_response }

            setApproveResponse(
              {
                status: 'pending',
                message:
                  `Waiting for ${
                    (origin === 'x' ?
                      x_asset_data :
                      y_asset_data
                    )?.symbol
                  } approval`,
                tx_hash: hash,
              }
            )

            setApproveProcessing(true)

            const approve_receipt =
              await signer.provider
                .waitForTransaction(
                  hash,
                )

            const {
              status,
            } = { ...approve_receipt }

            setApproveResponse(
              status ?
                null :
                {
                  status: 'failed',
                  message:
                    `Failed to approve ${
                      (origin === 'x' ?
                        x_asset_data :
                        y_asset_data
                      )?.symbol
                    }`,
                  tx_hash: hash,
                }
            )

            failed = !status

            setApproveProcessing(false)
            setApproving(false)
          }
          else {
            setApproving(false)
          }
        } catch (error) {
          failed = true

          const message =
            error?.reason ||
            error?.data?.message ||
            error?.message

          const code =
            _.slice(
              (message || '')
                .toLowerCase()
                .split(' ')
                .filter(s => s),
              0,
              2,
            )
            .join('_')

          setApproveResponse(
            {
              status: 'failed',
              message,
              code,
            }
          )

          setApproveProcessing(false)
          setApproving(false)
        }
      }

      if (!failed) {
        try {
          console.log(
            '[swap]',
            {
              domainId,
              contract_address,
              from:
                (origin === 'x' ?
                  x_asset_data :
                  y_asset_data
                )?.contract_address,
              to:
                (origin === 'x' ?
                  y_asset_data :
                  x_asset_data
                )?.contract_address,
              amount,
              minDy,
              deadline,
            },
          )

          const swap_request =
            await sdk.sdkPool
              .swap(
                domainId,
                contract_address,
                (origin === 'x' ?
                  x_asset_data :
                  y_asset_data
                )?.contract_address,
                (origin === 'x' ?
                  y_asset_data :
                  x_asset_data
                )?.contract_address,
                amount,
                minDy,
                deadline,
              )

          if (swap_request) {
            let gasLimit =
              await signer
                .estimateGas(
                  swap_request,
                )

            if (gasLimit) {
              gasLimit =
                FixedNumber.fromString(
                  gasLimit
                    .toString()
                )
                .mulUnsafe(
                  FixedNumber.fromString(
                    GAS_LIMIT_ADJUSTMENT
                      .toString()
                  )
                )
                .round(0)
                .toString()
                .replace(
                  '.0',
                  '',
                )

              swap_request.gasLimit = gasLimit
            }

            const swap_response =
              await signer
                .sendTransaction(
                  swap_request,
                )

            const {
              hash,
            } = { ...swap_response }

            setCallProcessing(true)

            const swap_receipt =
              await signer.provider
                .waitForTransaction(
                  hash,
                )

            const {
              status,
            } = { ...swap_receipt }

            failed = !status

            const _symbol =
              (
                origin === 'x' ?
                  symbols :
                  _.reverse(
                    _.cloneDeep(symbols)
                  )
              )
              .join('/')

            setCallResponse(
              {
                status:
                  failed ?
                    'failed' :
                    'success',
                message:
                  failed ?
                    `Failed to swap ${_symbol}` :
                    `Swap ${_symbol} successful`,
                tx_hash: hash,
              }
            )

            success = true
          }
        } catch (error) {
          let message = 
            error?.reason ||
            error?.data?.message ||
            error?.message

          const code =
            _.slice(
              (message || '')
                .toLowerCase()
                .split(' ')
                .filter(s => s),
              0,
              2,
            )
            .join('_')

          if (message?.includes('cannot estimate gas')) {
            message = 'Slippage exceeded. Please try increasing slippage tolerance and resubmitting your transfer.'
          }
          else if (message?.includes('dy < minDy')) {
            message = 'Exceeded slippage tolerance. Please increase tolerance and try again.'
          }

          switch (code) {
            case 'user_rejected':
              reset(code)
              break
            default:
              setCallResponse(
                {
                  status: 'failed',
                  message,
                  code,
                }
              )
              break
          }

          failed = true
        }
      }
    }

    setCallProcessing(false)
    setCalling(false)

    if (
      sdk &&
      address &&
      success
    ) {
      await sleep(1 * 1000)

      setPairTrigger(
        moment()
          .valueOf()
      )
      setBalanceTrigger(
        moment()
          .valueOf()
      )
    }
  }

  const calculateSwap = async _pair => {
    const {
      amount,
    } = { ...swap }

    setCalculateSwapResponse(null)

    if (
      _pair &&
      [
        'string',
        'number',
      ]
      .includes(typeof amount) &&
      ![
        '',
      ]
      .includes(amount)
    ) {
      let {
        amount,
        origin,
      } = { ...swap }

      origin =
        origin ||
        'x'

      const {
        asset_data,
        contract_data,
        domainId,
        lpTokenAddress,
        adopted,
        local,
      } = { ..._pair }
      const {
        contract_address,
      } = { ...contract_data }

      const x_asset_data =
        adopted?.address &&
        {
          ...(
            Object.fromEntries(
              Object.entries({ ...asset_data })
                .filter(([k, v]) =>
                  !['contracts'].includes(k)
                )
            )
          ),
          ...(
            equals_ignore_case(
              adopted.address,
              contract_address,
            ) ?
              contract_data :
              {
                chain_id,
                contract_address: adopted.address,
                decimals: adopted.decimals,
                symbol: adopted.symbol,
              }
          ),
        }

      const y_asset_data =
        local?.address &&
        {
          ...(
            Object.fromEntries(
              Object.entries({ ...asset_data })
                .filter(([k, v]) =>
                  !['contracts'].includes(k)
                )
            )
          ),
          ...(
            equals_ignore_case(
              local.address,
              contract_address,
            ) ?
              contract_data :
              {
                chain_id,
                contract_address: local.address,
                decimals: local.decimals,
                symbol: local.symbol,
              }
          ),
        }

      if (Number(amount) <= 0) {
        setSwapAmount('0')
      }
      else {
        if (
          !(
            equals_ignore_case(
              domainId,
              pair?.domainId,
            ) &&
            equals_ignore_case(
              lpTokenAddress,
              pair?.lpTokenAddress,
            )
          )
        ) {
          setSwapAmount(true)
          setPriceImpact(true)
        }

        try {
          amount =
            utils.parseUnits(
              (
                (
                  typeof amount === 'string' &&
                  amount.indexOf('.') > -1 ?
                    amount
                      .substring(
                        0,
                        amount.indexOf('.') +
                        (
                          (origin === 'x' ?
                            x_asset_data :
                            y_asset_data
                          )?.decimals ||
                          18
                        ) +
                        1,
                      ) :
                    amount
                ) ||
                0
              )
              .toString(),
              (origin === 'x' ?
                x_asset_data :
                y_asset_data
              )?.decimals ||
              18,
            )
            .toString()

          calculateSwapPriceImpact(
            domainId,
            amount,
            (origin === 'x' ?
              x_asset_data :
              y_asset_data
            )?.contract_address,
            (origin === 'x' ?
              y_asset_data :
              x_asset_data
            )?.contract_address,
          )

          console.log(
            '[getPoolTokenIndex]',
            {
              domainId,
              contract_address,
              tokenAddress:
                (origin === 'x' ?
                  x_asset_data :
                  y_asset_data
                )?.contract_address,
            },
          )

          const tokenIndexFrom =
            await sdk.sdkPool
              .getPoolTokenIndex(
                domainId,
                contract_address,
                (origin === 'x' ?
                  x_asset_data :
                  y_asset_data
                )?.contract_address,
              )

          console.log(
            '[getPoolTokenIndex]',
            {
              domainId,
              contract_address,
              tokenAddress:
                (origin === 'x' ?
                  y_asset_data :
                  x_asset_data
                )?.contract_address,
            },
          )

          const tokenIndexTo =
            await sdk.sdkPool
              .getPoolTokenIndex(
                domainId,
                contract_address,
                (origin === 'x' ?
                  y_asset_data :
                  x_asset_data
                )?.contract_address,
              )

          console.log(
            '[calculateSwap]',
            {
              domainId,
              contract_address,
              tokenIndexFrom,
              tokenIndexTo,
              amount,
            },
          )

          const _amount =
            await sdk.sdkPool
              .calculateSwap(
                domainId,
                contract_address,
                tokenIndexFrom,
                tokenIndexTo,
                amount,
              )

          console.log(
            '[amountToReceive]',
            {
              domainId,
              contract_address,
              tokenIndexFrom,
              tokenIndexTo,
              amount: _amount,
            },
          )

          setSwapAmount(
            utils.formatUnits(
              BigNumber.from(
                _amount ||
                '0'
              ),
              (origin === 'x' ?
                y_asset_data :
                x_asset_data
              )?.decimals ||
              18,
            )
          )
        } catch (error) {
          const message =
            error?.reason ||
            error?.data?.message ||
            error?.message

          console.log(
            '[calculateSwap]',
            {
              error: message,
            },
          )

          setCalculateSwapResponse(
            {
              status: 'failed',
              message,
            }
          )

          setSwapAmount(null)
        }
      }
    }
    else {
      setSwapAmount(null)
      setPriceImpact(null)
    }
  }

  const calculateSwapPriceImpact = async (
    domainId,
    amount,
    x_contract_address,
    y_contract_address,
  ) => {
    console.log(
      '[calculateSwapPriceImpact]',
      {
        domainId,
        amount,
        x_contract_address,
        y_contract_address,
      },
    )

    const price_impact =
      await sdk.sdkPool
        .calculateSwapPriceImpact(
          domainId,
          amount,
          x_contract_address,
          y_contract_address,
        )

    console.log(
      '[swapPriceImpact]',
      {
        domainId,
        amount,
        x_contract_address,
        y_contract_address,
        price_impact,
      },
    )

    setPriceImpact(
      Number(
        utils.formatUnits(
          BigNumber.from(
            price_impact ||
            '0'
          ),
          18,
        )
      ) *
      100
    )
  }

  const {
    chain,
    asset,
    amount,
  } = { ...swap }
  let {
    origin,
  } = { ...swap }

  origin =
    origin ||
    'x'

  const chain_data = (chains_data || [])
    .find(c =>
      c?.id === chain
    )
  const {
    chain_id,
    name,
    image,
    explorer,
    color,
  } = { ...chain_data }
  const {
    url,
    transaction_path,
  } = { ...explorer }

  const {
    slippage,
  } = { ...options }

  const {
    asset_data,
    contract_data,
    adopted,
    local,
    rate,
  } = { ...pair }

  const {
    contract_address,
  } = { ...contract_data }

  const _image = contract_data?.image

  const image_paths =
    (_image || '')
      .split('/')

  const image_name = _.last(image_paths)

  const x_asset_data =
    adopted?.address &&
    {
      ...(
        Object.fromEntries(
          Object.entries({ ...asset_data })
            .filter(([k, v]) =>
              !['contracts'].includes(k)
            )
        )
      ),
      ...(
        equals_ignore_case(
          adopted.address,
          contract_address,
        ) ?
          contract_data :
          {
            chain_id,
            contract_address: adopted.address,
            decimals: adopted.decimals,
            symbol: adopted.symbol,
            image:
              _image ?
                !adopted.symbol ?
                  _image :
                  adopted.symbol.startsWith(WRAPPED_PREFIX) ?
                    !image_name.startsWith(WRAPPED_PREFIX) ?
                      image_paths
                        .map((s, i) =>
                          i === image_paths.length - 1 ?
                            `${WRAPPED_PREFIX}${s}` :
                            s
                        )
                        .join('/') :
                      _image :
                    !image_name.startsWith(WRAPPED_PREFIX) ?
                      _image :
                      image_paths
                        .map((s, i) =>
                          i === image_paths.length - 1 ?
                            s
                              .substring(
                                WRAPPED_PREFIX.length,
                              ) :
                            s
                        )
                        .join('/') :
                undefined,
          }
      ),
    }

  const x_balance =
    x_asset_data &&
    (balances_data?.[chain_id] || [])
      .find(b =>
        equals_ignore_case(
          b?.contract_address,
          x_asset_data.contract_address,
        )
      )

  const x_balance_amount = x_balance?.amount

  const y_asset_data =
    local?.address &&
    {
      ...(
        Object.fromEntries(
          Object.entries({ ...asset_data })
            .filter(([k, v]) =>
              !['contracts'].includes(k)
            )
        )
      ),
      ...(
        equals_ignore_case(
          local.address,
          contract_address,
        ) ?
          contract_data :
          {
            chain_id,
            contract_address: local.address,
            decimals: local.decimals,
            symbol: local.symbol,
            image:
              _image ?
                !local.symbol ?
                  _image :
                  local.symbol.startsWith(WRAPPED_PREFIX) ?
                    !image_name.startsWith(WRAPPED_PREFIX) ?
                      image_paths
                        .map((s, i) =>
                          i === image_paths.length - 1 ?
                            `${WRAPPED_PREFIX}${s}` :
                            s
                        )
                        .join('/') :
                      _image :
                    !image_name.startsWith(WRAPPED_PREFIX) ?
                      _image :
                      image_paths
                        .map((s, i) =>
                          i === image_paths.length - 1 ?
                            s
                              .substring(
                                WRAPPED_PREFIX.length,
                              ) :
                            s
                        )
                        .join('/') :
                undefined,
          }
      ),
    }

  const y_balance =
    y_asset_data &&
    (balances_data?.[chain_id] || [])
      .find(b =>
        equals_ignore_case(
          b?.contract_address,
          y_asset_data.contract_address,
        )
      )

  const y_balance_amount = y_balance?.amount

  const valid_amount =
    typeof amount === 'string' &&
    ![
      '',
      '0',
      '0.0',
    ]
    .includes(amount) &&
    !isNaN(amount) &&
    utils.parseUnits(
      (
        amount.indexOf('.') > -1 ?
          amount
            .substring(
              0,
              amount.indexOf('.') +
              (
                (origin === 'x' ?
                  x_asset_data :
                  y_asset_data
                )?.decimals ||
                18
              ) +
              1,
            ) :
          amount
      ) ||
      '0',
      (origin === 'x' ?
        x_asset_data :
        y_asset_data
      )?.decimals ||
      18,
    )
    .lte(
      utils.parseUnits(
        (
          (
            origin === 'x' ?
              x_balance_amount :
              y_balance_amount
          ) ||
          0
        )
        .toString(),
        (origin === 'x' ?
          x_asset_data :
          y_asset_data
        )?.decimals ||
        18,
      )
    )

  const wrong_chain =
    chain_data &&
    wallet_chain_id !== chain_id &&
    !callResponse

  const is_walletconnect = provider?.constructor?.name === 'WalletConnectProvider'

  const disabled =
    swapAmount === true ||
    calling ||
    approving

  const boxShadow =
    color &&
    `${color}${
      theme === 'light' ?
        '44' :
        '33'
    } 0px 16px 128px 64px`

  return (
    <div className="grid grid-cols-1 lg:grid-cols-8 items-start gap-4 my-4">
      <div className="hidden lg:block col-span-0 lg:col-span-2" />
      <div className="col-span-1 lg:col-span-4">
        <div className="flex flex-col items-center justify-center space-y-6 sm:space-y-6 my-4 sm:my-6 mx-1 sm:mx-4">
          <div className="w-full max-w-md space-y-3">
            <div
              className="bg-white dark:bg-slate-900 rounded border dark:border-slate-700 space-y-8 pt-5 sm:pt-6 pb-6 sm:pb-7 px-4 sm:px-6"
              style={
                chain &&
                boxShadow ?
                  {
                    boxShadow,
                    WebkitBoxShadow: boxShadow,
                    MozBoxShadow: boxShadow,
                  } :
                  undefined
              }
            >
              <div className="flex items-center justify-between space-x-2">
                <div className="flex items-center space-x-1.5">
                  <h1 className="text-xl font-semibold">
                    Swap on
                  </h1>
                  <SelectChain
                    value={
                      chain ||
                      _.head(
                        (chains_data || [])
                          .filter(c => !c?.no_pool)
                          .map(c => c?.id)
                      )
                    }
                    onSelect={c => {
                      setSwap(
                        {
                          ...swap,
                          chain: c,
                        }
                      )
                    }}
                    origin=""
                    is_pool={true}
                    no_shadow={true}
                    className="w-fit flex items-center justify-center space-x-1.5 sm:space-x-2 mt-0.25"
                  />
                </div>
                <Options
                  disabled={disabled}
                  applied={
                    !_.isEqual(
                      Object.fromEntries(
                        Object.entries(options)
                          .filter(([k, v]) =>
                            ![
                              'slippage',
                            ]
                            .includes(k)
                          )
                      ),
                      Object.fromEntries(
                        Object.entries(DEFAULT_OPTIONS)
                          .filter(([k, v]) =>
                            ![
                              'slippage',
                            ]
                            .includes(k)
                          )
                      ),
                    )
                  }
                  initialData={options}
                  onChange={o => setOptions(o)}
                />
              </div>
              <div>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between space-x-2">
                    <span className="text-slate-600 dark:text-slate-500 text-sm font-medium">
                      Pay with
                    </span>
                    {
                      chain_data &&
                      asset &&
                      (origin === 'x' ?
                        x_asset_data :
                        y_asset_data
                      ) &&
                      (
                        <div className="flex items-center justify-between space-x-2">
                          <div className="flex items-center space-x-1">
                            <div className="text-slate-400 dark:text-slate-500 text-sm font-medium">
                              Balance:
                            </div>
                            <button
                              disabled={disabled}
                              onClick={() => {
                                const amount =
                                  origin === 'x' ?
                                    x_balance_amount :
                                    y_balance_amount

                                if (
                                  [
                                    'string',
                                    'number',
                                  ]
                                  .includes(typeof amount) &&
                                  ![
                                    '',
                                  ]
                                  .includes(amount)
                                ) {
                                  setSwap(
                                    {
                                      ...swap,
                                      amount,
                                    }
                                  )

                                  setSwapAmount(true)
                                }
                              }}
                            >
                              <Balance
                                chainId={chain_id}
                                asset={asset}
                                contractAddress={
                                  (origin === 'x' ?
                                    x_asset_data :
                                    y_asset_data
                                  ).contract_address
                                }
                                decimals={
                                  (origin === 'x' ?
                                    x_asset_data :
                                    y_asset_data
                                  ).decimals
                                }
                                symbol={
                                  (origin === 'x' ?
                                    x_asset_data :
                                    y_asset_data
                                  ).symbol
                                }
                                hideSymbol={false}
                                trigger={balanceTrigger}
                              />
                            </button>
                          </div>
                        </div>
                      )
                    }
                  </div>
                  <div className="bg-slate-100 dark:bg-slate-900 rounded border dark:border-slate-700 space-y-0.5 py-2.5 px-3">
                    <div className="flex items-center justify-between space-x-2">
                      <SelectAsset
                        disabled={disabled}
                        value={asset}
                        onSelect={(a, c) => {
                          setSwap(
                            {
                              ...swap,
                              asset: a,
                              amount: null,
                              origin:
                                [
                                  x_asset_data?.contract_address,
                                  y_asset_data?.contract_address,
                                ]
                                .findIndex(_c =>
                                  equals_ignore_case(
                                    _c,
                                    c,
                                  )
                                ) > -1 ?
                                  origin === 'x' ?
                                    equals_ignore_case(
                                      c,
                                      y_asset_data?.contract_address,
                                    ) ?
                                      'y' :
                                      origin :
                                    equals_ignore_case(
                                      c,
                                      x_asset_data?.contract_address,
                                    ) ?
                                      'x' :
                                      origin :
                                  origin,
                            }
                          )

                          getBalances(chain)
                        }}
                        chain={chain}
                        origin=""
                        is_pool={true}
                        data={
                          origin === 'x' ?
                            x_asset_data :
                            y_asset_data
                        }
                        className="flex items-center space-x-1.5 sm:space-x-2 sm:-ml-1"
                      />
                      <DebounceInput
                        debounceTimeout={750}
                        size="small"
                        type="number"
                        placeholder="0.00"
                        disabled={
                          (
                            disabled &&
                            swapAmount !== true
                          ) ||
                          !asset ||
                          !pair
                        }
                        value={
                          [
                            'string',
                            'number',
                          ]
                          .includes(typeof amount) &&
                          ![
                            '',
                          ]
                          .includes(amount) &&
                          !isNaN(amount) ?
                            amount :
                            ''
                        }
                        onChange={e => {
                          const regex = /^[0-9.\b]+$/

                          let value

                          if (
                            e.target.value === '' ||
                            regex.test(e.target.value)
                          ) {
                            value = e.target.value
                          }

                          if (typeof value === 'string') {
                            if (value.startsWith('.')) {
                              value = `0${value}`
                            }

                            value =
                              number_to_fixed(
                                value,
                                (origin === 'x' ?
                                  x_asset_data :
                                  y_asset_data
                                )?.decimals ||
                                18,
                              )
                          }

                          setSwap(
                            {
                              ...swap,
                              amount: value,
                            }
                          )

                          setSwapAmount(true)
                        }}
                        onWheel={e => e.target.blur()}
                        onKeyDown={e =>
                          [
                            'e',
                            'E',
                            '-',
                          ]
                          .includes(e.key) &&
                          e.preventDefault()
                        }
                        className={`w-36 sm:w-48 bg-transparent ${disabled ? 'cursor-not-allowed' : ''} rounded border-0 focus:ring-0 sm:text-lg font-semibold text-right py-1.5`}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-center mt-2 mb-0.5">
                  <button
                    disabled={
                      disabled ||
                      !pair
                    }
                    onClick={() => {
                      if (!disabled) {
                        setSwap(
                          {
                            ...swap,
                            origin:
                              origin === 'x' ?
                                'y' :
                                'x',
                            amount: null,
                          }
                        )

                        setSwapAmount(null)

                        setButtonDirection(
                          buttonDirection * -1
                        )

                        getBalances(chain)
                      }
                    }}
                    className={`bg-slate-100 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 ${disabled ? 'cursor-not-allowed' : ''} rounded-full sm:border dark:border-slate-800 flex items-center justify-center p-1.5 sm:p-4`}
                  >
                    <HiSwitchVertical
                      size={28}
                      style={
                        buttonDirection < 0 ?
                          {
                            transform: 'scaleX(-1)',
                          } :
                          undefined
                      }
                    />
                  </button>
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between space-x-2">
                    <span className="text-slate-600 dark:text-slate-500 text-sm font-medium">
                      You Receive
                    </span>
                    {
                      chain_data &&
                      asset &&
                      (origin === 'x' ?
                        y_asset_data :
                        x_asset_data
                      ) &&
                      (
                        <div className="flex items-center justify-between space-x-2">
                          <div className="flex items-center space-x-1">
                            <div className="text-slate-400 dark:text-slate-500 text-sm font-medium">
                              Balance:
                            </div>
                            <button
                              disabled={disabled}
                              className="cursor-default"
                            >
                              <Balance
                                chainId={chain_id}
                                asset={asset}
                                contractAddress={
                                  (origin === 'x' ?
                                    y_asset_data :
                                    x_asset_data
                                  ).contract_address
                                }
                                decimals={
                                  (origin === 'x' ?
                                    y_asset_data :
                                    x_asset_data
                                  ).decimals
                                }
                                symbol={
                                  (origin === 'x' ?
                                    y_asset_data :
                                    x_asset_data
                                  ).symbol
                                }
                                hideSymbol={false}
                                trigger={balanceTrigger}
                              />
                            </button>
                          </div>
                        </div>
                      )
                    }
                  </div>
                  <div className="bg-slate-100 dark:bg-slate-900 rounded border dark:border-slate-800 space-y-0.5 py-2.5 px-3">
                    <div className="flex items-center justify-between space-x-2">
                      <SelectAsset
                        disabled={disabled}
                        value={asset}
                        onSelect={(a, c) => {
                          setSwap(
                            {
                              ...swap,
                              asset: a,
                              amount: null,
                              origin:
                                [
                                  x_asset_data?.contract_address,
                                  y_asset_data?.contract_address,
                                ]
                                .findIndex(_c =>
                                  equals_ignore_case(
                                    _c,
                                    c,
                                  )
                                ) > -1 ?
                                  origin === 'x' ?
                                    equals_ignore_case(
                                      c,
                                      x_asset_data?.contract_address,
                                    ) ?
                                      'y' :
                                      origin :
                                    equals_ignore_case(
                                      c,
                                      y_asset_data?.contract_address,
                                    ) ?
                                      'x' :
                                      origin :
                                  origin,
                            }
                          )

                          getBalances(chain)
                        }}
                        chain={chain}
                        origin=""
                        is_pool={true}
                        data={
                          origin === 'x' ?
                            y_asset_data :
                            x_asset_data
                        }
                        className="flex items-center space-x-1.5 sm:space-x-2 sm:-ml-1"
                      />
                      {
                        swapAmount === true ?
                          <div className="w-36 sm:w-48 flex items-center justify-end py-1.5">
                            <div>
                              <Oval
                                color={loader_color(theme)}
                                width="20"
                                height="20"
                              />
                            </div>
                          </div> :
                          <DecimalsFormat
                            value={
                              [
                                'string',
                                'number',
                              ]
                              .includes(typeof swapAmount) &&
                              ![
                                '',
                              ]
                              .includes(swapAmount) &&
                              Number(swapAmount) >= 0 ?
                                swapAmount :
                                [
                                  'string',
                                  'number',
                                ]
                                .includes(typeof amount) &&
                                ![
                                  '',
                                ]
                                .includes(amount) ?
                                  '0.00' :
                                  '0.00'
                            }
                            className={
                              `w-36 sm:w-48 bg-transparent ${
                                [
                                  '',
                                  undefined,
                                ]
                                .includes(amount) ?
                                  'text-slate-500 dark:text-slate-500' :
                                  ''
                              } sm:text-lg font-semibold text-right py-1.5`
                            }
                          />
                      }
                    </div>
                  </div>
                </div>
              </div>
              {
                chain &&
                asset &&
                pair &&
                !pair.error &&
                Number(amount) > 0 &&
                (
                  <div className="bg-slate-100 dark:bg-slate-900 rounded border dark:border-slate-700 space-y-2.5 py-3.5 px-3">
                    <div className="flex items-center justify-between space-x-1">
                      <div className="whitespace-nowrap text-slate-500 dark:text-slate-500 text-sm font-medium">
                        Rate
                      </div>
                      <span className="whitespace-nowrap text-sm font-semibold space-x-1.5">
                        <DecimalsFormat
                          value={
                            number_format(
                              rate,
                              '0,0.000000000000',
                              true,
                            )
                          }
                          className="text-sm"
                        />
                      </span>
                    </div>
                    <div className="flex flex-col space-y-0.5">
                      <div className="flex items-start justify-between space-x-1">
                        <Tooltip
                          placement="top"
                          content="The maximum percentage you are willing to lose due to market changes."
                          className="z-50 bg-dark text-white text-xs"
                        >
                          <div className="flex items-center">
                            <div className="whitespace-nowrap text-slate-500 dark:text-slate-500 text-sm font-medium">
                              Slippage Tolerance
                            </div>
                            <BiInfoCircle
                              size={14}
                              className="block sm:hidden text-slate-400 dark:text-slate-500 ml-1 sm:ml-0"
                            />
                          </div>
                        </Tooltip>
                        <div className="flex flex-col sm:items-end space-y-1.5">
                          {slippageEditing ?
                            <>
                              <div className="flex items-center justify-end space-x-1.5">
                                <DebounceInput
                                  debounceTimeout={750}
                                  size="small"
                                  type="number"
                                  placeholder="0.00"
                                  value={
                                    typeof slippage === 'number' &&
                                    slippage >= 0 ?
                                      slippage :
                                      ''
                                  }
                                  onChange={e => {
                                    const regex = /^[0-9.\b]+$/

                                    let value

                                    if (
                                      e.target.value === '' ||
                                      regex.test(e.target.value)
                                    ) {
                                      value = e.target.value
                                    }

                                    if (typeof value === 'string') {
                                      if (value.startsWith('.')) {
                                        value = `0${value}`
                                      }

                                      if (!isNaN(value)) {
                                        value = Number(value)
                                      }
                                    }

                                    value =
                                      value <= 0 ||
                                      value > 100 ?
                                        DEFAULT_SWAP_SLIPPAGE_PERCENTAGE :
                                        value

                                    const _data = {
                                      ...options,
                                      slippage:
                                        value &&
                                        !isNaN(value) ?
                                          parseFloat(
                                            Number(value)
                                              .toFixed(6)
                                          ) :
                                          value,
                                    }

                                    setOptions(_data)
                                  }}
                                  onWheel={e => e.target.blur()}
                                  onKeyDown={e =>
                                    [
                                      'e',
                                      'E',
                                      '-',
                                    ]
                                    .includes(e.key) &&
                                    e.preventDefault()
                                  }
                                  className={`w-20 bg-slate-100 focus:bg-slate-200 dark:bg-slate-800 dark:focus:bg-slate-700 rounded border-0 focus:ring-0 text-sm font-semibold text-right py-1 px-2`}
                                />
                                <button
                                  onClick={() => setSlippageEditing(false)}
                                  className="bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400 hover:text-black dark:text-slate-200 dark:hover:text-white"
                                >
                                  <BiCheckCircle
                                    size={16}
                                  />
                                </button>
                              </div>
                              <div className="flex items-center space-x-1.5 -mr-1.5">
                                {
                                  [
                                    3.0,
                                    1.0,
                                    0.5,
                                  ]
                                  .map((s, i) => (
                                    <div
                                      key={i}
                                      onClick={() => {
                                        const _data = {
                                          ...options,
                                          slippage: s,
                                        }

                                        setOptions(_data)
                                        setSlippageEditing(false)
                                      }}
                                      className={`${slippage === s ? 'bg-slate-200 dark:bg-slate-700 font-bold' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 font-medium hover:font-semibold'} rounded cursor-pointer text-xs py-1 px-1.5`}
                                    >
                                      {s} %
                                    </div>
                                  ))
                                }
                              </div>
                            </> :
                            <div className="flex items-center space-x-1.5">
                              <span className="text-sm font-semibold">
                                {number_format(
                                  slippage,
                                  '0,0.000000',
                                )}%
                              </span>
                              <button
                                disabled={disabled}
                                onClick={() => {
                                  if (!disabled) {
                                    setSlippageEditing(true)
                                  }
                                }}
                                className="rounded-full flex items-center justify-center text-slate-400 hover:text-black dark:text-slate-200 dark:hover:text-white mt-0.5"
                              >
                                <BiEditAlt
                                  size={16}
                                />
                              </button>
                            </div>
                          }
                        </div>
                      </div>
                      {
                        typeof slippage === 'number' &&
                        (
                          slippage < 0.2 ||
                          slippage > 5.0
                        ) &&
                        (
                          <div className="flex items-center space-x-1">
                            <IoWarning
                              size={16}
                              className="min-w-max text-yellow-500 dark:text-yellow-400 mt-0.5"
                            />
                            <div className="text-yellow-500 dark:text-yellow-400 text-xs">
                              {slippage < 0.2 ?
                                'Your transfer may not complete due to low slippage tolerance.' :
                                'Your transfer may be frontrun due to high slippage tolerance.'
                              }
                            </div>
                          </div>
                        )
                      }
                    </div>
                    {
                      typeof priceImpact === 'number' &&
                      (
                        <div className="flex items-center justify-between space-x-1">
                          <Tooltip
                            placement="top"
                            content="Price impact"
                            className="z-50 bg-dark text-white text-xs"
                          >
                            <div className="flex items-center">
                              <div className="whitespace-nowrap text-slate-500 dark:text-slate-500 text-sm font-medium">
                                Price Impact
                              </div>
                              <BiInfoCircle
                                size={14}
                                className="block sm:hidden text-slate-400 dark:text-slate-500 ml-1 sm:ml-0"
                              />
                            </div>
                          </Tooltip>
                          <span className="whitespace-nowrap text-sm font-semibold space-x-1.5">
                            <span>
                              {number_format(
                                priceImpact,
                                '0,0.000000',
                                true,
                              )}
                              %
                            </span>
                          </span>
                        </div>
                      )
                    }
                  </div>
                )
              }
              {
                web3_provider &&
                wrong_chain ?
                  <Wallet
                    connectChainId={chain_id}
                    className="w-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 rounded flex items-center justify-center text-white text-base font-medium space-x-1.5 sm:space-x-2 py-3 sm:py-4 px-2 sm:px-3"
                  >
                    <span className="mr-1.5 sm:mr-2">
                      {is_walletconnect ?
                        'Reconnect' :
                        'Switch'
                      } to
                    </span>
                    {
                      image &&
                      (
                        <Image
                          src={image}
                          width={28}
                          height={28}
                          className="rounded-full"
                        />
                      )
                    }
                    <span className="font-semibold">
                      {name}
                    </span>
                  </Wallet> :
                    chain &&
                    asset &&
                    (origin === 'x' ?
                      x_balance :
                      y_balance
                    ) &&
                    (
                      (
                        [
                          'string',
                          'number',
                        ]
                        .includes(typeof amount) &&
                        ![
                          '',
                        ]
                        .includes(amount)
                      ) ||
                      web3_provider
                    ) ?
                      !callResponse &&
                      !calling &&
                      [
                        'string',
                        'number',
                      ]
                      .includes(typeof amount) &&
                      ![
                        '',
                      ]
                      .includes(amount) &&
                      (
                        (
                          utils.parseUnits(
                            (
                              typeof amount === 'string' &&
                              amount.indexOf('.') > -1 ?
                                amount
                                  .substring(
                                    0,
                                    amount.indexOf('.') +
                                    (
                                      (origin === 'x' ?
                                        x_asset_data :
                                        y_asset_data
                                      )?.decimals ||
                                      18
                                    ) +
                                    1,
                                  ) :
                                amount
                            ) ||
                            '0',
                            (origin === 'x' ?
                              x_asset_data :
                              y_asset_data
                            ).decimals ||
                            18,
                          )
                          .gt(
                            utils.parseUnits(
                              (
                                origin === 'x' ?
                                  x_balance_amount :
                                  y_balance_amount
                              ) ||
                              '0',
                              (origin === 'x' ?
                                x_asset_data :
                                y_asset_data
                              ).decimals ||
                              18,
                            )
                          ) &&
                          [
                            'string',
                            'number',
                          ]
                          .includes(
                            typeof (
                              origin === 'x' ?
                                x_balance_amount :
                                y_balance_amount
                            )
                          )
                        ) ||
                        Number(amount) < 0
                      ) ?
                        <Alert
                          color="bg-red-400 dark:bg-red-500 text-white text-sm font-medium"
                          icon={
                            <BiMessageError
                              className="w-4 sm:w-6 h-4 sm:h-6 stroke-current mr-3"
                            />
                          }
                          closeDisabled={true}
                          rounded={true}
                          className="rounded p-4.5"
                        >
                          <span>
                            {
                              (
                                utils.parseUnits(
                                  (
                                    typeof amount === 'string' &&
                                    amount.indexOf('.') > -1 ?
                                      amount
                                        .substring(
                                          0,
                                          amount.indexOf('.') +
                                          (
                                            (origin === 'x' ?
                                              x_asset_data :
                                              y_asset_data
                                            )?.decimals ||
                                            18
                                          ) +
                                          1,
                                        ) :
                                      amount
                                  ) ||
                                  '0',
                                  (origin === 'x' ?
                                    x_asset_data :
                                    y_asset_data
                                  ).decimals ||
                                  18,
                                )
                                .gt(
                                  utils.parseUnits(
                                    (
                                      origin === 'x' ?
                                        x_balance_amount :
                                        y_balance_amount
                                    ) ||
                                    '0',
                                    (origin === 'x' ?
                                      x_asset_data :
                                      y_asset_data
                                    ).decimals ||
                                    18,
                                  )
                                ) &&
                                [
                                  'string',
                                  'number',
                                ]
                                .includes(
                                  typeof (
                                    origin === 'x' ?
                                      x_balance_amount :
                                      y_balance_amount
                                  )
                                )
                              ) ?
                                'Insufficient Balance' :
                                Number(amount) < 0 ?
                                  'The amount cannot be equal to or less than 0.' :
                                  ''
                            }
                          </span>
                        </Alert> :
                        !(
                          callResponse ||
                          calculateSwapResponse
                        ) ?
                          <button
                            disabled={
                              disabled ||
                              !pair ||
                              !valid_amount
                            }
                            onClick={() => {
                              setSlippageEditing(false)
                              call()
                            }}
                            className={`w-full ${disabled || !pair || !valid_amount ? calling || approving ? 'bg-blue-400 dark:bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800 pointer-events-none cursor-not-allowed text-slate-400 dark:text-slate-500' : 'bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 cursor-pointer text-white'} rounded text-base text-center py-3 sm:py-4 px-2 sm:px-3`}
                          >
                            <span className="flex items-center justify-center space-x-1.5">
                              {
                                disabled &&
                                (
                                  <TailSpin
                                    color="white"
                                    width="20"
                                    height="20"
                                  />
                                )
                              }
                              <span>
                                {calling ?
                                  approving ?
                                    approveProcessing ?
                                      'Approving' :
                                      'Please Approve' :
                                    callProcessing ?
                                      'Swapping' :
                                      typeof approving === 'boolean' ?
                                        'Please Confirm' :
                                        'Checking Approval' :
                                  swapAmount === true ?
                                    'Calculating' :
                                    [
                                      'string',
                                      'number',
                                    ]
                                    .includes(typeof amount) &&
                                    ![
                                      '',
                                      '0',
                                      '0.0',
                                    ]
                                    .includes(amount) ?
                                      'Swap' :
                                      'Enter amount'
                                }
                              </span>
                            </span>
                          </button> :
                          (
                            callResponse ||
                            approveResponse ||
                            calculateSwapResponse
                          ) &&
                          (
                            [
                              callResponse ||
                              approveResponse ||
                              calculateSwapResponse,
                            ]
                            .map((r, i) => {
                              const {
                                status,
                                message,
                                code,
                                tx_hash,
                              } = { ...r }

                              return (
                                <Alert
                                  key={i}
                                  color={`${status === 'failed' ? 'bg-red-400 dark:bg-red-500' : status === 'success' ? 'bg-green-400 dark:bg-green-500' : 'bg-blue-400 dark:bg-blue-500'} text-white`}
                                  icon={
                                    status === 'failed' ?
                                      <BiMessageError
                                        className="w-4 sm:w-6 h-4 sm:h-6 stroke-current mr-3"
                                      /> :
                                      status === 'success' ?
                                        <BiMessageCheck
                                          className="w-4 sm:w-6 h-4 sm:h-6 stroke-current mr-3"
                                        /> :
                                        status === 'pending' ?
                                          <div className="mr-3">
                                            <Watch
                                              color="white"
                                              width="20"
                                              height="20"
                                            />
                                          </div> :
                                          <BiMessageDetail
                                            className="w-4 sm:w-6 h-4 sm:h-6 stroke-current mr-3"
                                          />
                                  }
                                  closeDisabled={true}
                                  rounded={true}
                                  className="rounded p-4.5"
                                >
                                  <div className="flex items-center justify-between space-x-2">
                                    <span className="break-words text-sm font-medium">
                                      {ellipse(
                                        (message || '')
                                          .substring(
                                            0,
                                            status === 'failed' &&
                                            error_patterns
                                              .findIndex(c =>
                                                message?.indexOf(c) > -1
                                              ) > -1 ?
                                              message.indexOf(
                                                error_patterns
                                                  .find(c =>
                                                    message.indexOf(c) > -1
                                                  )
                                              ) :
                                              undefined,
                                          )
                                          .trim() ||
                                        message,
                                        128,
                                      )}
                                    </span>
                                    <div className="flex items-center space-x-1">
                                      {
                                        status === 'failed' &&
                                        message &&
                                        !calculateSwapResponse &&
                                        (
                                          <Copy
                                            value={message}
                                            className="cursor-pointer text-slate-200 hover:text-white"
                                          />
                                        )
                                      }
                                      {
                                        url &&
                                        tx_hash &&
                                        (
                                          <a
                                            href={`${url}${transaction_path?.replace('{tx}', tx_hash)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                          >
                                            <TiArrowRight
                                              size={20}
                                              className="transform -rotate-45"
                                            />
                                          </a>
                                        )
                                      }
                                      {status === 'failed' ?
                                        <button
                                          onClick={() => reset(code)}
                                          className="bg-red-500 dark:bg-red-400 rounded-full flex items-center justify-center text-white p-1"
                                        >
                                          <MdClose
                                            size={14}
                                          />
                                        </button> :
                                        status === 'success' ?
                                          <button
                                            onClick={() => reset()}
                                            className="bg-green-500 dark:bg-green-400 rounded-full flex items-center justify-center text-white p-1"
                                          >
                                            <MdClose
                                              size={14}
                                            />
                                          </button> :
                                          null
                                      }
                                    </div>
                                  </div>
                                </Alert>
                              )
                            })
                          ) :
                    web3_provider ?
                      <button
                        disabled={true}
                        onClick={() => call()}
                        className="w-full bg-slate-100 dark:bg-slate-800 cursor-not-allowed rounded text-slate-400 dark:text-slate-500 text-base sm:text-base text-center py-3 sm:py-4 px-2 sm:px-3"
                      >
                        {
                          !asset ?
                            'Swap' :
                            pair === undefined ?
                              `Route doesn't exist` :
                              pair ?
                                pair.error ?
                                  <div className="max-w-fit break-words text-red-600 dark:text-red-400 text-sm text-left mx-auto">
                                    {pair.error.message}
                                  </div> :
                                  'Enter amount' :
                                <div className="flex items-center justify-center space-x-2">
                                  <div>
                                    <TailSpin
                                      color={loader_color(theme)}
                                      width="20"
                                      height="20"
                                    />
                                  </div>
                                  <span className="text-slate-400 dark:text-slate-500 text-base">
                                    Fetching pair information ...
                                  </span>
                                </div>
                        }
                      </button> :
                      <Wallet
                        connectChainId={chain_id}
                        buttonConnectTitle="Connect Wallet"
                        className="w-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 rounded text-white text-base font-medium text-center sm:space-x-2 py-3 sm:py-4 px-2 sm:px-3"
                      >
                        <span>
                          Connect Wallet
                        </span>
                      </Wallet>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}