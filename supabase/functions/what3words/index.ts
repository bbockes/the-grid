import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

type RequestBody = {
  action: 'autosuggest' | 'convert-to-coordinates'
  input?: string
  words?: string
  focus?: string
  language?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('WHAT3WORDS_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'MissingApiKey',
            message:
              'Set WHAT3WORDS_API_KEY in Supabase Edge Function secrets.',
          },
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const body = (await req.json()) as RequestBody
    const url = new URL('https://api.what3words.com/v3/' + body.action)
    url.searchParams.set('key', apiKey)

    if (body.action === 'autosuggest') {
      if (!body.input?.trim()) {
        return new Response(
          JSON.stringify({
            error: { code: 'MissingInput', message: 'input is required' },
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }
      url.searchParams.set('input', body.input.trim())
      if (body.focus) url.searchParams.set('focus', body.focus)
      if (body.language) url.searchParams.set('language', body.language)
    } else if (body.action === 'convert-to-coordinates') {
      if (!body.words?.trim()) {
        return new Response(
          JSON.stringify({
            error: { code: 'MissingWords', message: 'words is required' },
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }
      url.searchParams.set('words', body.words.trim())
    } else {
      return new Response(
        JSON.stringify({
          error: { code: 'BadAction', message: 'Unknown action' },
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const response = await fetch(url)
    const payload = await response.json()

    return new Response(JSON.stringify(payload), {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: { code: 'ServerError', message } }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
