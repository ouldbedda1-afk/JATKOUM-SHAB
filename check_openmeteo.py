import urllib.request

url = ('https://api.open-meteo.com/v1/forecast?'
       'latitude=18.0735,20.9375&'
       'longitude=-15.9582,-17.0339&'
       'current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,pressure_msl&'
       'hourly=temperature_2m,precipitation_probability&'
       'daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&'
       'timezone=Africa/Nouakchott&forecast_days=7')
req = urllib.request.Request(url, headers={'User-Agent': 'python'})
with urllib.request.urlopen(req, timeout=20) as r:
    print('status', r.status)
    print('retry-after', r.getheader('Retry-After'))
    body = r.read(5000).decode('utf-8', errors='replace')
    print(body)
