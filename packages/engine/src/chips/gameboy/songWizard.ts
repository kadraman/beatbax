/**
 * BeatBax metadata and example song templates for the Game Boy (DMG-01) chip plugin.
 *
 * These are intended as starting points for users to build their own songs, and
 * are not meant to be comprehensive demonstrations of the plugin's capabilities.
 */

export const CHIP_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAGMAAAB4CAMAAADR9Lz/AAAAVFBMVEX39/f19fX09PT5+fnz8/Py8vLa2tqxsLC/v7/Gxsa3t7fg4ODu7u7n5+fNzc2bm5rU1NSqqqmioqKTkpKLiopgYGBvb26FhYR4d3dMTEt9fXyBgYDfd2QUAAASn0lEQVRo3pRYiYKquhIMUbLvicDI///nqw6guMyc+zKLCtJFVa+BsX+u4a+Tl8e/z+uO9Wpr+D/whjPK+3eG8/oPdvvi/Gz539fs5vkbj5drX9Dxxl2PS/spNrwhDYfZ7egTYMc4n3sAPC+9unHgvoMeMnxhsmO/qvTQ6ol2InZGdN5b7yD88AB6Cs9efTq8gmxanRjuOgzny7ezXLZYtL1eLicnDsf17MnuzfrD+PAWZMMZbTsuarD3JUcpdjrb2cfXdjd9ysT5wePxtZfo24/Sh2zGNNsUl2mV2vLL5RT8L/9Ot8wOCM6evnio+6CwSzC4FoaSRVYqRyNzVp0Oe/fnNyYcP+ws2jNEdmK7mXRbYzPCaKWDMkopmWXww9PH34V6oTo8wv4Z58MzUnkxWpYWs1QdQWvuhNro/Gqaf2AwdsoW9iI0YyJ6NnhYrbUARic9ooRwH2TZ6PzKgHPyCPvMFXYGoU/GOLy5MGe1jDFmZQ//uWTKVzp88zZ/1epTveODi4lZODvB0YNP8HvE7fOtsLCr1bnTQazx72KxD+vszU8sFD/GIks3PVwGJ+CdmLXdb//CfCA6dnyrU58+Z+wciuzI/mHIekjRtCgVTCPbx8tl9BApFpP24BroQH7zjnPflHnxzQ7JfLEs57wuSytGmUymSTXQyRXU6Pbx3dF5HDjT8Q8M/rVAPvJ+YEo6H3XQpsz3+ww2oLM7wNlA1NReYa6AgWpF0j2w0R7CsU/tXhNqLIGFLEJIKcDd7X6vyZJSFE8XRDCCoJCnqMEM3DmLA63iZKfBr8Mvwf3MGiaK5xAACCmlIkGnJqOThTC7aoxUi/ERw6Oz65Rj1WTi6t55sI8AY0ZdRUwWIEmYn59bQ0AlnQxSUQQZa0YYQxgKgrrHNAtrcj5USl3nDt1fW2N/v+O4IpjJQliRgmi3Wu/TtBbtrTZZCxw0h0MG11OnKOtKvHI/inhPgx/+LGUdI2TvCm7ZAkRPrfu+LssajfBeGwPRyE2nIIg1tozW6ayIN0TdX7G7vSI5QgEL4a0otxywEuGs0z2aYC3KS8YLmd4aJQWBrDVqYb35qd77kf3q7f5iix2yAQlcIe6LIoi+NAyhY+UgBFV8vJBqYEd+R1WO8xx8Xhq8fmXDRycejuEGZUIZJEeyHig+TJGs7yBwBSrkfVqiAk1tpLLALbVmqpjeq2Uxrcb3/nEOgO39WBLT2Wr42PqyqM04fgVWIpfLOC9TM8RDtLUWY2JzbLBOm/U2N3UZBsb+cjpL2Y9Fi2mFrGKpHeJY+ztEVlxut0UKkeu63LNeLU1LJqgWZ8/+FVcsK54glTTWeTXBzIZhxRMp9RBo00/BB6hnTPUoVUEFXWNhH/XqPU18RHJIVFeHGa7OWhwI9oDpblHGGHlXtqsYSh5H74wOptZwNFP+W6OHK5yLARZU8nYpuzrWnoikABqAkJUyiAKupiuqiQkhwjPvtf1tmAN4RjmMARaVduZudhq0HjyA0WlUiQQiEBPdeB0Qz7q1zP7qHz1wBZKjZI1gFd61GjrGBtHNdWdsUhlkg+9EiqL2BBqyzuK1732JYMwKo62GMJLQCJwTDbElCRA05iEpc0SSekFSWdS6ZEKKsXL2WWlfMgTlMDEVMesQkbjqLah2EmFbgEBQwBsa8nmbQi4jphGlEqQylz967TbZoByOUWoCEWGqR+rtCJoAOkQGjYZSQ7VZV41G5aVGssyWfcNgr8kxpIYOThhmynsC7gqRU0knwsiouxAKRStRcqBYIwGnW2SfzYK/0vDoHJiq+uyJMqFTevqAjPdlCKLkFjydSClTKF2NCnG6afZ+58fQePxdNGaFlsGCQKYYqBiK8EQwqgctYcRGfZLOYdwbBiRHavfJsm+zDz/1WZoV9CyNIU3iJNPu4wNhWyRULnMmd1O9j24YkRxJTssyDr/NV8fuVUTLMRnKTmSizvGwDwo7gsyF1oyoEpQpEaHknNSpLrd8+Y7x3HZQcoiGkEEh0fLWVNfsDWHHiLGnC4pKE8w5IUNY15tgbyPI67aRbcmBAkFL6XaLZPQQCOY3CMgEgLgai5BCpOXCmR9xLxkd//u0c9o6XmhWwIgLO1DrNnVCD4RtkSeAgVEl9dKoVNSXq/egAanM5fedwP6CzhFmyi4Yjz9ts2rkQWBHAIlY10oIwMjVQyokR5h+bp6d9OfP1GDHvM1sFEOpZAhmp5+437rcFNpWh6ixTrJXLXgcyeFHJIdefuTlM7P5MwdHbz0GaQsa+Mkm/9xK7mi7RrtKXSese+ixrBVaEpqs1AF1xH+tHvw58XBflQv3rgiMztO9lXKgHCQ6i9rqPfYOgoiIjqHJIqFaLWe77Ni0vc4KRTixrmVDwba8rg2zYPeDPEPU1hazdRATDc0j6AVyXdO5OrHnI4fTkgajmMjzHGFvK1mYaQCzk9icQUJhr6C3rJeUHN5SAt4mdx6iGZnftrj8cRTlcOhDP5RFAFMaUmUHzFxJtLLx6N6Yit4yBoM0o7FK67WitrizP2D+jcZF4zuzEZjFsZ2kXTk1w94fTFxnjDS7VA1r2qov2pS6XLtU9V6JkeMnjI/BhBcM0ivqR3D0uNDrvlvG7J5o9jB1hXM2h8MbjdoUYjpXiwlUgMZtja/m2BePU3JcvanzVLVnI7tcCKaosM9WxObeyBlzm/LGwsSCou7gOXNb1eX1GdmVn5Ui3VAOPe3irlbNCNroucqJY6uP7djWbdFYDTYh93nGKN/LL6QKl9FScrQbkuPF5I7B+fNREMY2pDqOMOxZzDpVQGBX6McnDMYDbNTaMkHQraGXiuTAhg1SLS/JscXVk8f2BCUUi0kPWOP2SEQhZOpdQ3hMi5o2tEFsAxt2Gdl0DJRozoVDAOZbC2ep+IGxwfDN/dm4cRz59bpPksxhz93ismB+TRoKYqusaV6jMrVXF3RbkEZyhLk1/1aftjzfH9NsjwdiGq+O8+t4DnANnVbp2qykcIDBLroPVwZ1wKA+6XGw2B9qtcZy3sPyHle7VIdiTGGsApGP/nvF7KRniNOkxpacngJImt9QXOr9f21aAZurKAxUFkQEREVR6///nzcJoLb3+r3b7e61hGSSySTbHgB2Du1s+Xymv585oKkw1DKRi5Hq3zOi8yagNS6RpjEyE6gcw/oJkOoScyx8i8tl/e/7xXvqQOJCK5Rq/5M1GeRtTPnZzGZyue27iTZO8+jgOBUHQoVLEMGrd7domKyeWm/0kKH2eIP7x3brr/V2Hv/y3ILM8JIMIEk6NyOr9NXxEki8eh/baJ8KcWHiuKllO7fgv9G79zQ8ciu8SqFr4kBkOYoD2jjo+Op2JV2bsvcrrtDSDUFQftrS57MtFT6c4r7bAZ3kaiBF4RFgRTxSzi6xFo2k19yEIpZetej607Id177pcp6iU6T7hjIj63LeZB5Z5su/pj9R60NK+dQ66PCvSxiFt3RdkMWqRkn9U1SKagyhGjU0a4hNDZJg8ss9qn2xCS3durjtOP64Pucx+u9ht67PVF6YggtkyTpLPDJAlTbttxM4vORVRXwZBZAAnwLxz7mBb78v7m4jNWMkkgulQ6GCG5f7xxr54UT6Pi2+MeeWjs9xnokMDd/KhWhSitsGL3jxM/SIobnm1G+tIHO8wO0MR/k16LAZT9q2mXQe+3WkpH5B/r6lamhj2HrwyDgcyf/4wFA3QpRoIbQeDRC8tMOHNcGblFJs2n+uuV8VABvQI2D8sB/uPTPVk4sfbIn2CnS1bjjR5BAopNdSAqzkz4b7CygKVT+krW/e2/b6vWF/YIcSZBkVmfPz+bngDGK2je6OivwZtp45G3qEKDd+/PPngvdOHxba4gmNTvRrd23X+jkDzCwPT5d9bbbnaDjDLOr5Z+YRAyWjnmuIhwib+xm0gnZs2Z7bsW4H7SrqucIxG5Apy6ueTBxgQZeLYzDDsY3PTp/OpKvL24Yko9AKinPNb4jSqb1qn/eoTBvop4b6LHRDHxe97nrE/+uoOJZw2K8ZvMZLcJ3n9B2DRf+jZzZuZ3pXkyhYOCi4uK8TOsQY+9GrsA5Fj2Don/+X2hmE4gcwFyiOWvMTJOE7fzIdNm3Xr8NoZ6gCMQczOtlFSFbiESihZyB/EwnnFZ+Pf9AKQn6p6wfj4oebou6hKLRuW0ggg0Ez9JAQaI5QuTmrbqWQ64F3+iV1BWkFNLW3QsmaiF6F9kFPLQIEEez6qJplYdz3yWKuQXfClFnVU2FdRpzStqG8JysKncMpga7WvqR8cYp+Ceqz44phZByXVTX9ByODPmLnWY/MIU0vWSCqKxkP9kO2XewUxIUUj+wRdTapJOi7nW6vD1CfX9N+nWlEqLqZi8PVq+WQ80+VrzhUrZ4pq1x2UD4qotjhaUJ1OsU5bAdF3i6JFtcu65GdiyO/mJiYeIwDLzNf0XMfjePMvROb/ijDf1J6caD3M2gM+kpwqdvOKgEeQXGsR9fcGVLhLvdvihuGikM6lesTl+h66L81Tt/kJ103WhzvPa0VKcGdn2YayBf5FeD2FbQmF6BYBk9u3JPCuMYwD/paajKKxwweTBETLVeJR8YhJtPUlH3QqHwuOVg2onapxpXLWaF3eLFfl/mpqbYdYl1T+NGSHqHOkZJ9yqLAwHlL3yhWyN5hsUpS4mYygUCGlsWbcYrvpl4vw00tc/QlJopGYNIjQHxo69XbggKTIL4ryXOUdKEnveecZzCo6ifTGYzmY4+hLy4hjTXrlcpErJjtgfhgdDxMXkzS/en92UjBoeGfpzBRlHPu8iV1XCH6e2/XZaCF4WfKGqeWpmQFKsDD4JR47u4u3FLhpb/K2mvbefYEJDKLY4XHRBxBFDUDlBUTjau5kuueTlIUKqPNEClUD0WJWrzylVcoDrKhiieSMrgpktXSphIMouonIERuhMwvooO8N8uRxiaHWDy9thA6AgY/VNuHzvEDuAvHqBOgfB9Dc1IcphvSuyhBQDzXQMcEdQvQL9yZ02EDWRWCzyYoUmCtV52002C9d7LScZXiGWLrea5JQ/O/TwBkMIhQVCNBGGGdPFtRbAg+lFBWMfWafIlikOtM5NRkewP+6ppC1uImuEKJhD3wwJh3BMzeVBxkRpU4lp5fv3BKYrzyPmmRNhpHIE64OHS5ubwpV9S0KngAEXPtmPKswxXJTq59WWkhv9N2bb+78ez9ubbXRvsKII4meyFUt2qTtXczFvnRKEkzaYe+E4aJ6B1WpBSl3+eSEm4wbfyo+bTTqV26RNw6xKxDk53iefmacrLiIEuJsLHMVx4UZCE5ZqgyNu97klb3W/wa2ni4YZvstqjjcMs2oU3ZEQUY0lyYUL4ylm+aTbANpSzCIxrHzowImRiWWRvLsksQkS1BLsmbzfgU2jW54TQN7UcGMycqjqzQHtj5XYW2sh/OZ4OtYGfGzvd53z25fDk1RzekbtoGd6wiJGvOoXGdRZNdz1m2T32LmxGzmZZtUBd3NYDsTIQzvBbW2qh8O71as412m9XncPM2TRBs3vd67JddN/fKpWZsW1OKlAJhzqjjX60JRkbTxwn6cXIZkOGCEz0CJdfN91vfpXWa/IxQDZ/SKgvSzxfJxujesthT1S6NXm4Mazj44wkyt+KdnTh2FzZj0uLj4RX0SB+G1bXiaX9tzdtCvTfvysofNd3IGY35WXc+B2tagXa08Zj6o/f72mo0PoyAeg66jmJSPl9yUOjiguuDs6wGTHHsKIxwJqJ5IM2gQMa4dGEFIXT2M7dzUH6i9cwYhsuWSbwUriwccT9QHyrv3PLB1QJ+R5OVsHqlGaMfu3WVw+HtZxKmA60DJjfO47DoKF7lVlrTuwZl8eN1/Rw6pmSVnVnWZfQ+XspqpzwZVzT8u24Z+mj2Piv/px6qwYIyzmE/6FFKs1qqtAZBbHUMyDA0FMnMzG3W2Xnuw6xzk71HszLN0PnqjkgjHzTeT0uW5W2FM/yJC+oFLr8TXgRq+Yd5UqrgoOQNiMg/NM/1lagn5y/qTmZBzoTFkMyjqKIbrOuyf+KhfSsekfCFNYW6ZRiaGqkSr/ejCGQ2Rc5gxhyhJHxn4rHv6QCpWyfEo2wz3KoGmj/QqgiPfHwN3v0od8plw2wPZ4Y1JV4/pG1LaYdob8s9KmPV/KUDeJua8ah5pepTIatP6r6TYIXnbR9xPK8H9t4rS39LKPTEL1Oy1p7itORDmhK7kli5WlQhgWyymlNF5tEevLOEjYOc8a4IwjeEqiLCb25Kdb+Pkz+Il775JXyyqO6qBMkK5OERJW5bim3kLFbZVu3CT6HcZl7SrwxXTvzItVJYT23kOle3J7mT3/x7v6X8dw8tbVVQbR7Knvq+cXnRuJT/AbRRItH5Qm8bAAAAAElFTkSuQmCC';

export const gbSongWizard = {
    metadata: {
      chipDisplayName: 'Game Boy (DMG-01)',
      platform: 'Nintendo Game Boy',
      year: '1989',
      channelSummary: '2 pulse, 1 wave, 1 noise',
      image: `data:image/png;base64,${CHIP_IMAGE_BASE64}`,
    },
    // we could add more templates here, but this one is already pretty comprehensive and demonstrates a wide range of the plugin's capabilities
    templates: {
      instruments: [
        {
          id: 'gb-sample-instruments',
          label: 'Sample instruments',
          content:
`
inst lead type=pulse1 duty=60 env={"level":12,"direction":"flat","period":1,"format":"gb"} gm=81
inst arp  type=pulse2 duty=25 env={"level":9,"direction":"down","period":2,"format":"gb"} gm=84
inst bass type=wave wave=[0,5,11,15,15,15,15,15,11,5,0,0,0,0,0,0,0,0,6,8,8,8,8,8,8,8,8,6,0,0,0,0] gm=39

inst snare  type=noise env={"level":12,"direction":"down","period":1,"format":"gb"}
inst hihat  type=noise env={"level":5,"direction":"down","period":1,"format":"gb"}
inst shaker type=noise gb:width=7 env={"level":4,"direction":"down","period":1,"format":"gb"} length=4
`,
        },
      ],
      effects: [
        {
          id: 'gb-sample-fx',
          label: 'Sample effects',
          content:
`
effect exprVib  = vib:3,5,sine,4    # medium vibrato — expressiveness on peaks
effect deepVib  = vib:5,3,sine,6    # slow, deep vibrato — atmospheric bridge tension
effect fastVib  = vib:2,8,sine,2    # fast shimmer — blazing climax and peak notes

effect minorArp = arp:3,7           # minor triad  (Am, Dm: root + min3 + P5)
effect majArp   = arp:4,7           # major triad  (F, G: root + maj3 + P5)
effect dom7Arp  = arp:4,7,10        # dominant 7th (E7: root + maj3 + P5 + min7)

effect slide    = port:4            # snappy slide — scalar run articulation
`
        },
      ],
      structure: [
        {
          id: 'gb-sample-structure',
          label: 'Sample structure',
          content:
`
pat melody_pat      = (C5 C5 G5<fastVib>:4 G5 A5 G5<exprVib>:4) (C3:2 .) * 4
pat melody_alt_pat  = (E5 E5 G5<fastVib>:4 F5 E5 C5<slide>:4)
pat bass_pat        = (C3 . C3 . ) * 2 (C3 . . .) * 2  (G2 . . .) * 2
pat arp_pat         = C4<majArp>:4 E4<majArp>:4 G4<majArp>:4 C5<majArp>:4
pat drums_pat       = (snare . . .) (snare . . .) (snare . . .)
pat drums_alt_pat   = (snare . . .) * 2 (shaker hihat) * 8

seq lead_seq        = melody_pat melody_alt_pat
seq bass_seq        = bass_pat
seq arp_seq         = arp_pat * 2
seq drums_seq       = drums_pat drums_alt_pat

channel 1 => inst lead  seq lead_seq
channel 2 => inst arp   seq arp_seq
channel 3 => inst bass  seq bass_seq
channel 4 => inst hihat seq drums_seq

play
`
        },
      ],
      defaults: {
        instruments: 'gb-sample-instruments',
        effects: 'gb-sample-fx',
        structure: 'gb-sample-structure',
      },
    },
  };
