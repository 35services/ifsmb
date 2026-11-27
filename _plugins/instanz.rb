# frozen_string_literal: true

# Several sites from one code base (ifsmb.de, 35services.ifsmb.de, …): what belongs to one instance stays out of the
# shared files, so merging the code from ifsmb.de never conflicts with an instance's own wording.
#
# 1. Overrides: _data/instanz/ lies over _data/ – at the same path, key by key.
#      _data/instanz/i18n/de.yml   →  over _data/i18n/de.yml (only the keys in it; the rest stays)
#      _data/instanz/themes.yml    →  replaces _data/themes.yml (lists are replaced, hashes merged)
#    For i18n every overridden key must exist in _data/i18n/<language>.yml (typo guard: the build stops otherwise),
#    and placeholders ({n}, {0} …) must stay the same. assets/js/i18n-strings.js is built from the merged data, so
#    the browser gets the instance's texts too. _scripts/test_i18n.rb merges the same way.
#    ifsmb.de itself has no _data/instanz/ – its texts are the shared ones.
#
# 2. Optional pages: {% ifpage /spenden/ %}…{% endifpage %} renders its content only if the site has a page with that
#    address (pages, collection documents and generated pages). Layouts use it for links to pages not every instance
#    has (Spenden, Angebot, Todos, Stichworte …), so an instance without them gets no dead links.
#    {% unlesspage /tags/ %}…{% endunlesspage %} is the opposite (e.g. a tag as plain text when there is no /tags/).
module Instanz
  module_function

  def deep_merge(base, over)
    return over unless base.is_a?(Hash) && over.is_a?(Hash)

    base.merge(over) { |_key, a, b| deep_merge(a, b) }
  end

  # "a.b.c" => value for every leaf (plural forms { one, other } count as one leaf, like in test_i18n.rb)
  PLURAL = %w[zero one two few many other].freeze
  def leaves(hash, prefix = '')
    hash.each_with_object({}) do |(k, v), out|
      if v.is_a?(Hash) && !(v.keys - PLURAL).empty?
        out.merge!(leaves(v, "#{prefix}#{k}."))
      else
        out["#{prefix}#{k}"] = v
      end
    end
  end

  def placeholders(value)
    Array(value.is_a?(Hash) ? value.values : value).join(' ').scan(/\{\w+\}/).sort.uniq
  end

  def check_i18n(core, over, language)
    core_leaves = leaves(core || {})
    leaves(over || {}).each do |key, value|
      unless core_leaves.key?(key)
        raise Jekyll::Errors::FatalException,
              "_data/instanz/i18n/#{language}.yml: Schlüssel „#{key}“ gibt es in _data/i18n/#{language}.yml nicht (Tippfehler?)"
      end
      next if placeholders(core_leaves[key]) == placeholders(value)

      raise Jekyll::Errors::FatalException,
            "_data/instanz/i18n/#{language}.yml: „#{key}“ muss dieselben Platzhalter haben wie das Original " \
            "(#{placeholders(core_leaves[key]).join(' ')})"
    end
  end

  def apply(site)
    over = site.data['instanz']
    return unless over.is_a?(Hash)

    over.each do |name, value|
      if name == 'i18n' && value.is_a?(Hash)
        value.each { |language, strings| check_i18n(site.data.dig('i18n', language), strings, language) }
      end
      site.data[name] = deep_merge(site.data[name], value)
    end
  end

  def normalize(url)
    u = url.to_s.strip.sub(/[#?].*\z/, '')
    u = "/#{u}" unless u.start_with?('/')
    u.end_with?('/') || File.extname(u) != '' ? u : "#{u}/"
  end

  def page_urls(site)
    @page_urls ||= {}
    @page_urls[site.object_id] ||= begin
      urls = site.pages.map(&:url) + site.documents.select(&:write?).map(&:url)
      urls.map { |u| normalize(u) }.to_h { |u| [u, true] }
    end
  end

  def reset(site)
    @page_urls&.delete(site.object_id)
  end

  # {% ifpage /address/ %} … {% endifpage %}
  class IfPage < Liquid::Block
    def initialize(tag_name, markup, tokens)
      super
      @url = markup.strip.delete('"\'')
    end

    def render(context)
      site = context.registers[:site]
      Instanz.page_urls(site).key?(Instanz.normalize(@url)) == want ? super : ''
    end

    def want
      true
    end
  end

  # {% unlesspage /address/ %} … {% endunlesspage %} – the other way round (e.g. plain text instead of a link)
  class UnlessPage < IfPage
    def want
      false
    end
  end
end

# data first, before any generator (partner pages, feeds …) reads it
Jekyll::Hooks.register :site, :post_read do |site|
  Instanz.apply(site)
  Instanz.reset(site)
end

# the list of pages once all generators have run (generated partner pages count too)
Jekyll::Hooks.register :site, :pre_render do |site|
  Instanz.reset(site)
end

Liquid::Template.register_tag('ifpage', Instanz::IfPage)
Liquid::Template.register_tag('unlesspage', Instanz::UnlessPage)
