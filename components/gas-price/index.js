import { useState, useEffect } from 'react'
import { useSelector, shallowEqual } from 'react-redux'
import { utils } from 'ethers'
import { RotatingSquare } from 'react-loader-spinner'
import { MdLocalGasStation } from 'react-icons/md'

import { number_format, loader_color } from '../../lib/utils'

export default (
  {
    chainId,
    dummy,
    iconSize = 20,
    minGasPrice = 0.00000001,
    className = '',
  },
) => {
  const {
    preferences,
    rpc_providers,
  } = useSelector(state =>
    (
      {
        preferences: state.preferences,
        rpc_providers: state.rpc_providers,
      }
    ),
    shallowEqual,
  )
  const {
    rpcs,
  } = { ...rpc_providers }
  const {
    theme,
  } = { ...preferences }

  const [gasPrice, setGasPrice] = useState(null)

  useEffect(
    () => {
      const getData = async is_interval => {
        if (rpcs?.[chainId]) {
          if (!is_interval) {
            setGasPrice(null)
          }

          const provider = rpcs[chainId]

          try {
            setGasPrice(
              Number(
                utils.formatUnits(
                  await provider
                    .getGasPrice(),
                  'gwei',
                )
              )
            )
          } catch (error) {
            if (!gasPrice) {
              setGasPrice('')
            }
          }
        }
      }

      getData()

      const interval =
        setInterval(() =>
          getData(true),
          0.5 * 60 * 1000,
        )

      return () => clearInterval(interval)
    },
    [chainId, rpcs],
  )

  return (
    chainId ?
      <div className={`flex items-center justify-center text-slate-400 dark:text-slate-500 space-x-1 ${className}`}>
        <MdLocalGasStation
          size={iconSize}
        />
        {typeof gasPrice === 'number' ?
          <>
            <span className="whitespace-nowrap font-semibold">
              {gasPrice < minGasPrice ?
                `< ${
                  number_format(
                    minGasPrice,
                    '0,0.00000000',
                    true,
                  )
                }` :
                number_format(
                  gasPrice,
                  '0,0',
                  true,
                )
              }
            </span>
            <span className="font-medium">
              Gwei
            </span>
          </> :
          typeof gasPrice === 'string' ?
            <span>
              -
            </span> :
            <RotatingSquare
              color={
                theme === 'light' ?
                  '#b0b0b0' :
                  '#808080'
              }
              width="16"
              height="16"
            />
        }
      </div> :
      dummy &&
      (
        <div className="h-5" />
      )
  )
}