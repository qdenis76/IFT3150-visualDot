var svg = d3.select("svg");
var svgGroup = svg.select("g");
var nodes, edges, result, nodeIds, edgeIds;

$(function(){
	$(document).tooltip();
	$("#resizable").resizable({ maxWidth: $("body").width(), minWidth: $("body").width()});
	$("#file").change(function() {
		nodes = null;
		edges = null;
		debugAlignment = null;
		result = null;
		nodeIds = new Object();
		edgeIds = new Object();
		$('#nodeLink').empty();
		$('#hiddenNodes').empty();
		var reader = new FileReader();    
		reader.onload = function() {
			var content = reader.result;
			try {
				result = dagre.dot.toObjects(content);
				result.edges.forEach(function(e) { if (!e.label) { e.label = ""; } });
			} catch (e) {
				alert("Fichier invalide!!!");
			}
			if (result) {
				result.nodes.forEach(function(node) {
					node.inEdges = [];
					node.outEdges = [];
				});
				result.edges.forEach(function(edge) {
					edge.source.outEdges.push(edge);
					edge.target.inEdges.push(edge);
				});
				draw(result.nodes, result.edges);
			}
		};
		reader.readAsText($("#file")[0].files[0]);
	});
});

function draw(nodeData, edgeData) {
	svgGroup.selectAll("*").remove();

	nodes = svgGroup
	.selectAll("g .node")
	.data(nodeData);

	var nodeId = 0;
	var nodeEnter = nodes
	.enter()
	.append("g")
	.attr("class", "node")
	.attr("id", function(d) { nodeId++; nodeIds[nodeId]=d.id; return "node-"+nodeId; })
	.each(function(d) { d.nodePadding = 10; });
	nodeEnter.append("rect");
	nodes.exit().remove();

	edges = svgGroup
	.selectAll("g .edge")
	.data(edgeData);

	var edgeId = 0;
	var edgeEnter = edges
	.enter()
	.append("g")
	.attr("class", "edge")
	.attr("id", function(d) { edgeId++; edgeIds[edgeId]=d.id; return "edge-"+edgeId; })
	.each(function(d) { d.nodePadding = 0; });
	edgeEnter
	.append("path")
	.attr("marker-end", "url(#arrowhead)")
	.attr("id", function(d) {if(d.vdRelation=="association" || d.style=="dashed") return "association"; else return "inheritance";});
	edges.exit().remove();

	addLabels();

	var layout = dagre.layout()
	.nodes(nodeData)
	.edges(edgeData)
	.run();

	edges.each(function(d) { ensureTwoControlPoints(d); });

	enableZoom();
	enableDrag(nodes,edges);
	addEdgesCircles(edgeEnter);
	update();
	initClickNode();
	initTooltip();
	for(var i in nodeIds) {
		initMenu("#node-"+i);
	}
	initSlider();
}

function addLabels() {
	var labelGroup = svgGroup.selectAll("g").append("g").attr("class", "label");
	labelGroup.append("rect");
	labelGroup.append("text");

	labelGroup
	.select("text")
	.attr("text-anchor", "left")
	.append("tspan")
	.attr("dy", "1em")
	.text(function(d) { if(d.vdRelation==null && !(d.vdType==null)) { return d.vdType; } else { return d.label;}});

	labelGroup
	.each(function(d) {
		var bbox = this.getBBox();
		d.bbox = bbox;
		d.width = bbox.width + 2 * d.nodePadding;
		d.height = bbox.height + 2 * d.nodePadding;
	});
}

function enableZoom() {
	svg.call(d3.behavior.zoom().on("zoom", function redraw() {
		svgGroup.attr("transform", "translate(" + d3.event.translate + ")" + " scale(" + d3.event.scale + ")");
	}));
}
function ensureTwoControlPoints(d) {
	var points = d.dagre.points;
	if (!points.length) {
		var s = d.source.dagre;
		var t = d.target.dagre;
		points.push({ x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 });
	}
	if (points.length === 1) {
		points.push({ x: points[0].x, y: points[0].y });
	}
}

function enableDrag(nodes, edges) {
	nodes.call(d3.behavior.drag()
			.origin(function(d) { return {x: d.dagre.x, y: d.dagre.y}; })
			.on('drag', function (d, i) {
				d.dagre.x = d3.event.x;
				d.dagre.y = d3.event.y;
				d.outEdges.forEach(function(e) {
					var points = e.dagre.points;
					if (points[0].y === points[1].y) {
						points[1].y += d3.event.dy;
					}

					points[0].y += d3.event.dy;
					if (points[1].y < points[0].y) {
						points[0].y = points[1].y;
					}
					translateEdge(e, d3.event.dx, 0);
				});
				d.inEdges.forEach(function(e) {
					var points = e.dagre.points;
					if (points[1].y === points[0].y) {
						points[0].y += d3.event.dy;
					}
					points[1].y += d3.event.dy;
					if (points[0].y > points[1].y) {
						points[1].y = points[0].y;
					}
					translateEdge(e, d3.event.dx, 0);
				});
				update();
			}));

	edges
	.call(d3.behavior.drag()
			.on('drag', function (d, i) {
				translateEdge(d, d3.event.dx, d3.event.dy);
				update();
			}));
}

function translateEdge(e, dx, dy) {
	e.dagre.points.forEach(function(p) {
		p.x += dx;
		p.y += dy;
	});
}

function addEdgesCircles(edgeEnter) {
	edgeEnter
	.selectAll("circle.cp")
	.data(function(d) {
		d.dagre.points.forEach(function(p) { p.parent = d; });
		return d.dagre.points.slice(0).reverse();
	})
	.enter()
	.append("circle")
	.attr("class", "cp")
	.call(d3.behavior.drag()
			.on("drag", function(d) {
				d.y += d3.event.dy;
				translateEdge(d.parent, d3.event.dx, 0);
				update();
			}));
}

function update() {
	nodes
	.attr("transform", function(d) {
		return "translate(" + d.dagre.x + "," + d.dagre.y +")"; })
		.selectAll("g.node rect")
		.attr("x", function(d) { return -(d.bbox.width / 2 + d.nodePadding); })
		.attr("y", function(d) { return -(d.bbox.height / 2 + d.nodePadding); })
		.attr("width", function(d) { return d.width; })
		.attr("height", function(d) { return d.height; });

	edges
	.selectAll("path")
	.attr("d", function(d) {
		var points = d.dagre.points.slice(0);
		var source = dagre.util.intersectRect(d.source.dagre, points[0]);
		var target = dagre.util.intersectRect(d.target.dagre, points[points.length - 1]);
		points.unshift(source);
		points.push(target);
		return d3.svg.line()
		.x(function(e) { return e.x; })
		.y(function(e) { return e.y; })
		.interpolate("linear")
		(points);
	});

	edges
	.selectAll("circle")
	.attr("r", 5)
	.attr("cx", function(d) { return d.x; })
	.attr("cy", function(d) { return d.y; });

	svgGroup
	.selectAll("g.label rect")
	.attr("x", function(d) { return -d.nodePadding; })
	.attr("y", function(d) { return -d.nodePadding; })
	.attr("width", function(d) { return d.width; })
	.attr("height", function(d) { return d.height; });

	nodes
	.selectAll("g.label")
	.attr("transform", function(d) { return "translate(" + (-d.bbox.width / 2) + "," + (-d.bbox.height / 2) + ")"; });

	edges
	.selectAll("g.label")
	.attr("transform", function(d) {
		var points = d.dagre.points;
		var x = (points[0].x + points[1].x) / 2;
		var y = (points[0].y + points[1].y) / 2;
		return "translate(" + (-d.bbox.width / 2 + x) + "," + (-d.bbox.height / 2 + y) + ")";
	});
}

function initClickNode() {
	$(".node").click( function(evt) {
		if (evt.ctrlKey) {
			hideNode($(this));
		}
		if (evt.shiftKey) {
			resetColoredItems();
			displayNodeLinks($(this));
		} else {
			displayNodeInfos($(this));
		}
	});
}

function hideNode(node) {
	node.hide(200);
	var nodeId = nodeIds[node.attr("id").substring(5,node.attr("id").length)];
	$('#hiddenNodes').append("<p><span class='hiddenNode' id='"+node.attr("id")+"'>"+nodeId+"</span></p>");
	for(var k in edgeIds) {
		if(edgeIds[k].indexOf(nodeId+"-") !== -1) {
			$("#edge-"+k).hide(200);
		}
	}
	$(".hiddenNode").click( function() {
		showNode($(this));
	});
}

function showNode(node) {
	$("#hiddenNodes #"+node.attr("id")).remove();
	$("#"+node.attr("id")).show(200);
	var nodeId = nodeIds[node.attr("id").substring(5,node.attr("id").length)];
	for(var k in edgeIds) {
		if(edgeIds[k].indexOf(nodeId+"-") !== -1) {
			$("#edge-"+k).show(200);
		}
	}
}

function showAllNodes() {
	for(var i in nodeIds) {
		$("#node-"+i).show(200);
	}
	for(var k in edgeIds) {
		$("#edge-"+k).show(200);
	}
}

function displayNodeLinks(node) {
	var nodeId = nodeIds[node.attr("id").substring(5,node.attr("id").length)];
	$("#"+node.attr("id")+" rect").attr("style","stroke:green").attr("class","colored-node");
	$('#nodeLink').empty();
	$("#nodeLink").append("<h3>Lien(s) du noeud <span class='red'>"+nodeId+"</span></h3>");
	for(var i=0;i<result.nodes.length; i++) {
		if(nodeId==result.nodes[i].id) {
			for(var j=0;j<result.nodes[i].outEdges.length; j++) {
				var type;
				result.nodes[i].outEdges[j].vdRelation=="association" || result.nodes[i].outEdges[j].style=="dashed" ? type="association" : type="héritage";
				$("#nodeLink").append("<p>"+nodeId+" <span class='red'>&#8594</span> "+result.nodes[i].outEdges[j].target.id+" ("+type+")</p>");
				$("#edge-"+findSvgId(result.nodes[i].outEdges[j].id,"edge")+" path").attr("style","stroke:red").attr("class","colored-edge").attr("marker-end","url(#redarrowhead)");
				$("#node-"+findSvgId(result.nodes[i].outEdges[j].target.id,"node")+" rect").attr("style","stroke:red").attr("class","colored-node");
			}
			for(j=0;j<result.nodes[i].inEdges.length; j++) {
				var type;
				result.nodes[i].inEdges[j].vdRelation=="association" || result.nodes[i].inEdges[j].style=="dashed" ? type="association" : type="héritage";
				$("#nodeLink").append("<p>"+nodeId+" <span class='red'>&#8592</span> "+result.nodes[i].inEdges[j].source.id+" ("+type+")</p>");
				$("#edge-"+findSvgId(result.nodes[i].inEdges[j].id,"edge")+" path").attr("style","stroke:red").attr("class","colored-edge").attr("marker-end","url(#redarrowhead)");	
				$("#node-"+findSvgId(result.nodes[i].inEdges[j].source.id,"node")+" rect").attr("style","stroke:red").attr("class","colored-node");
			}
		}
	}
//	$("html, body").animate({ scrollTop: $(document).height() }, "slow");
}	


function findSvgId(id,type) {
	if(type=="edge") {
		for(var i in edgeIds) {
			if(edgeIds[i]==id) {
				return i;
			}
		}
	}
	if(type=="node") {
		for(var i in nodeIds) {
			if(nodeIds[i]==id) {
				return i;
			}
		}
	}
}

function resetColoredItems() {
	$(".colored-node").attr("style","stroke:#333").attr("class","");
	$(".colored-edge").attr("style","stroke:#333").attr("class","").attr("marker-end","url(#arrowhead)");	
}

function initMenu(id) {
	$(function(){
		$.contextMenu({
			selector:id,		
			items: {
				"hide": {name: "Cacher (Ctrl+clic)", 
					callback: function(key, options) {
						hideNode($(this)); 
					}
				},
				"list": {name: "Liste des noeuds connectés (Shift+clic)", 
					callback: function(key, options) {
						resetColoredItems();
						displayNodeLinks($(this));
					}
				},
				"sep1":"--------",
				"cancel": {name: "Annuler", 
					callback: function(key, options) {
						$('#nodeLink').empty();
						resetColoredItems();
					}
				}
			}
		});
	});
}

function initTooltip() {
	var div = d3.select("body").append("div").attr("class", "tooltip").style("opacity", 0);					
	$(".node").on("mouseover", function(d) {
		var nodeId = nodeIds[$(this).attr("id").substring(5,$(this).attr("id").length)];
		var tooltipContent = "<h1>Methods</h1>";
		for(var i=0;i<result.nodes.length; i++) {
			if(nodeId==result.nodes[i].id) {
				tooltipContent += replaceAll(result.nodes[i].vdMethods,",",", ");
				tooltipContent += "<h1>Properties</h1>";
				tooltipContent += replaceAll(result.nodes[i].vdProps,",",", ");
				tooltipContent += "<h1>Number</h1>";
				tooltipContent += result.nodes[i].vdNumber;
				tooltipContent += "<h1>File reference</h1>";
				tooltipContent += result.nodes[i].vdFile;
			}
		}
		div.transition().style("opacity", .9);
		div.html(tooltipContent).style("left", d.pageX+"px").style("top", d.pageY+"px");
	});
	$(".node").on("mouseout", function(d) {
		div.transition().style("opacity", 0);
	});	
}

function displayText(text) {
	if(text.length <= 100) {
		return text;
	} else {
		return text.substring(0,99)+"<br>"+displayText(text.substring(99,text.length));
	}
}

function initSlider() {
	$("#nodesFilter").empty();
	$("#nodesFilter").append("<label>Nombre d'occurence entre </label><input size='12' type='text' id='sliderMinValue'/> et <input size='12' type='text' id='sliderMaxValue'/> <div id='slider'></div>");
	var max = maxNodeNumber();
	$("#slider").slider({
		range: true,
		min: 0,
		max: max,
		values: [0,max],
		slide: function( event, ui ) {
			$("#sliderMinValue").val(ui.values[0]);
			$("#sliderMaxValue").val(ui.values[1]);
			nodesFilter(ui.values[0],ui.values[1]);
		}
	});
	$("#sliderMinValue").val($("#slider").slider("values",0));
	$("#sliderMinValue").change(function() {
		$("#slider").slider( "option", "values", [this.value,$("#sliderMaxValue").val()]);
		nodesFilter(this.value,$("#sliderMaxValue").val());
	});
	$("#sliderMaxValue").val($("#slider").slider("values",1));
	$("#sliderMaxValue").change(function() {
		$("#slider").slider( "option", "values", [$("#sliderMinValue").val(),this.value]);
		nodesFilter($("#sliderMinValue").val(),this.value);
	});
}

function maxNodeNumber() {
	var max = 0;
	for(var i=0;i<result.nodes.length; i++) {
		if(parseInt(result.nodes[i].vdNumber) > max) {
			max = parseInt(result.nodes[i].vdNumber);
		}
	}
	return max;
}

function nodesFilter(min,max) {
	for(var i=0;i<result.nodes.length; i++) {
		if((parseInt(result.nodes[i].vdNumber) > max || parseInt(result.nodes[i].vdNumber) < min) && $("#node-"+findSvgId(result.nodes[i].id,"node")).attr("filtered")!=="yes") {
			$("#node-"+findSvgId(result.nodes[i].id,"node")).attr("filtered","yes");
			$("#node-"+findSvgId(result.nodes[i].id,"node")).hide();
			for(var k in edgeIds) {
				if(edgeIds[k].indexOf(result.nodes[i].id+"-") !== -1) {
					$("#edge-"+k).hide();
				}
			}
		}
		if(parseInt(result.nodes[i].vdNumber) <= max && parseInt(result.nodes[i].vdNumber) >= min && $("#node-"+findSvgId(result.nodes[i].id,"node")).attr("filtered")=="yes") {
			$("#node-"+findSvgId(result.nodes[i].id,"node")).attr("filtered","");
			$("#node-"+findSvgId(result.nodes[i].id,"node")).show();
			for(var j=0;j<result.edges.length; j++) {
				if(result.edges[j].id.indexOf(result.nodes[i].id+"-")!==-1 && $("#node-"+findSvgId(result.edges[j].source.id,"node")).attr("filtered")!=="yes" && $("#node-"+findSvgId(result.edges[j].target.id,"node")).attr("filtered")!=="yes") {
					$("#edge-"+findSvgId(result.edges[j].id,"edge")).show();
				}
			}
		}
	}
}

function displayNodeInfos(node) {
	$("#nodeInfos").empty();
	var nodeId = nodeIds[node.attr("id").substring(5,node.attr("id").length)];
	var infos = "<h1>Id</h1>";
	for(var i=0;i<result.nodes.length; i++) {
		if(nodeId==result.nodes[i].id) {
			infos += result.nodes[i].vdType;
			infos += "<h1>Methods</h1>";
			infos += replaceAll(result.nodes[i].vdMethods,",",", ");
			infos += "<h1>Properties</h1>";
			infos += replaceAll(result.nodes[i].vdProps,",",", ");
			infos += "<h1>Number</h1>";
			infos += result.nodes[i].vdNumber;
			infos += "<h1>File reference</h1>";
			infos += result.nodes[i].vdFile;
		}
	}
	$("#nodeInfos").append(infos);
}

// http://naspinski.net/post/Javascript-replaceAll-function.aspx
function replaceAll(txt, replace, with_this) {
	return txt.replace(new RegExp(replace, 'g'),with_this);
}