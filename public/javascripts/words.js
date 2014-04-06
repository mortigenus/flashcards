"use strict";
function initializeWords()
{
    for (var i = 0; i < bootstrapWords.length; ++i) {
        var word = bootstrapWords[i];
        word.creationDate = new Date(word.creationDate);
    }
}

function removeWord(wordId, callback)
{
    $.post("/word/remove/" + wordId)
    .done(function() {
        callback();
    })
    .fail(function(obj, err, errDescr) {
        stub.failure("Error: " + errDescr);
    })
}

$(document).ready(function() {
    initializeWords();
    var table = new LazyTable($(".dictionary"));
    sortWordsNatural(table, bootstrapWords);

    var tagcloud = $(".tagcloud");
    tagcloud.hide();
    $(".dictionary").hammer().on("hold", function(e) {
        var entry = $(e.target).closest(".entry");
        var word = entry.find(".original").text();
        var shouldRemove = confirm("Remove word '" + word + "'?");
        if (!shouldRemove)
            return;
        var wordId = entry.attr("data-word-id");
        removeWord(wordId, onWordRemoved);

        function onWordRemoved()
        {
            entry.slideUp("fast");
        }
    });
    $(".sort-item.alphabetically").addClass("active");
    $(".sort-item.alphabetically").hammer().on("tap", function(e) {
        tagcloud.slideUp("fast");
        sortWordsNatural(table, bootstrapWords);
    });
    $(".sort-item.groupby-day").hammer().on("tap", function(e) {
        tagcloud.slideUp("fast");
        sortWordsByDate(table, bootstrapWords);
    });
    $(".sort-item.groupby-tag").hammer().on("tap", function(e) {
        tagcloud.slideDown("fast");
        var tags = $(".tagcloud .tag.active").map(function(a, b) { return b.textContent; });
        sortWordsByTag(table, bootstrapWords, tags);
    });
    $(".sort-item").hammer().on("tap", function(e) {
        $(".sort-item.active").removeClass("active");
        $(e.target).addClass("active");
    });
    $(".tagcloud .tag").hammer().on("tap", function(e) {
        $(e.target).toggleClass("active");
        var tags = $(".tagcloud .tag.active").map(function(a, b) { return b.textContent; });
        sortWordsByTag(table, bootstrapWords, tags);
    });
})

function renderRow(template, word)
{
    function tagNames(tags)
    {
        var result = [];
        for (var i = 0; i < tags.length; ++i)
            result.push(tags[i].name);
        return result;
    }
    var entry = template.clone();
    entry.removeClass("template");
    entry.attr("href", "/word/edit/" + word.id);
    entry.attr("data-word-id", word.id);
    entry.find(".original").text(word.original);
    entry.find(".translation").text(word.translation);
    entry.find(".tags").text(tagNames(word.tags).join(", "));
    return entry.get(0);
}

function renderSection(template, sectionHeader)
{
    var node = template.clone();
    node.removeClass("template");
    node.text(sectionHeader);
    return node.get(0);
}

function formatDate(date)
{
    return date.getDate() + "-" + (date.getMonth() + 1) + "-" + date.getFullYear();
}

function wordComparator(word1, word2)
{
    if (word1.original < word2.original)
        return -1;
    if (word1.original > word2.original)
        return 1;
    return 0;
}

function sortWordsNatural(table, words)
{
    if (!words || !words.length)
        return;
    var rowTemplate = $(".entry.template");
    words.sort(wordComparator);
    $(".title-item.center .count").text(words.length);
    table.render(["all"], {
        "all": words,
    }, renderRow.bind(null, rowTemplate));
}

function sortWordsByDate(table, words)
{
    if (!words || !words.length)
        return;
    $(".title-item.center .count").text(words.length);
    var wordsPerDate = {};
    var dates = [];
    for (var i = 0; i < words.length; ++i) {
        var formattedDate = formatDate(words[i].creationDate);
        if (!wordsPerDate[formattedDate]) {
            wordsPerDate[formattedDate] = [];
            dates.push(words[i].creationDate);
        }
        wordsPerDate[formattedDate].push(words[i]);
    }
    for (var formattedDate in wordsPerDate) {
        var w = wordsPerDate[formattedDate];
        w.sort(wordComparator);
    }
    dates.sort(function(date1, date2) {
        return date2 - date1;
    });
    dates = dates.map(formatDate);

    var rowTemplate = $(".entry.template");
    var sectionTemplate = $(".section.template");
    table.render(dates, wordsPerDate, renderRow.bind(null, rowTemplate), renderSection.bind(null, sectionTemplate));
}

function sortWordsByTag(table, words, tags)
{
    tags.sort();
    var wordsPerTag = {};
    for (var i = 0; i < tags.length; ++i)
        wordsPerTag[tags[i]] = [];
    var filteredWords = 0;
    for (var i = 0; i < words.length; ++i) {
        var word = words[i];
        var isFiltered = false;
        for (var j = 0; j < word.tags.length; ++j) {
            var tag = word.tags[j].name;
            if (!wordsPerTag[tag])
                continue;
            wordsPerTag[tag].push(word);
            isFiltered = true;
        }
        if (isFiltered)
            ++filteredWords;
    }
    $(".title-item.center .count").text(filteredWords);
    var rowTemplate = $(".entry.template");
    var sectionTemplate = $(".section.template");
    table.render(tags, wordsPerTag, renderRow.bind(null, rowTemplate), renderSection.bind(null, sectionTemplate));
}

var LazyTable = function(dictionaryElement)
{
    var dictionary = $(dictionaryElement);
    this._containerElement = dictionary.find(".dictionary-container");
    this._loadMore = dictionary.find(".load-next");
    this._loadMore.hide();
    this._loadMore.hammer().on("tap", this._onLoadMore.bind(this));
}

LazyTable.DOMElementsPerChunk = 20;

LazyTable.prototype = {
    _onLoadMore: function(event)
    {
        event.gesture.stopPropagation();
        event.gesture.preventDefault();
        this._showNextFrame();
    },

    _showNextFrame: function()
    {
        this._containerElement.append(this._fragments.shift());
        if (!this._fragments.length)
            this._loadMore.hide();
        else
            this._loadMore.show();
    },

    _appendAndRecreateIfNeeded: function(fragment, child)
    {
        fragment.appendChild(child);
        if (fragment.childNodes.length < LazyTable.DOMElementsPerChunk)
            return fragment;
        this._fragments.push(fragment);
        return document.createDocumentFragment();
    },

    render: function(sections, wordsPerSection, rowRenderer, sectionHeaderRenderer)
    {
        this._containerElement.empty();
        this._fragments = [];
        var fragment = document.createDocumentFragment();
        for (var i = 0; i < sections.length; ++i) {
            var section = sections[i];
            var words = wordsPerSection[section];
            var sectionElement = sectionHeaderRenderer ? sectionHeaderRenderer(section) : null;
            if (sectionElement)
                fragment = this._appendAndRecreateIfNeeded(fragment, sectionElement);
            for (var j = 0; j < words.length; ++j) {
                var rowElement = rowRenderer(words[j]);
                fragment = this._appendAndRecreateIfNeeded(fragment, rowElement);
            }
        }
        if (fragment.childNodes.length > 0)
            this._fragments.push(fragment);

        if (!this._fragments.length) {
            this._loadMore.hide();
            return;
        }
        this._showNextFrame();
    }
};
